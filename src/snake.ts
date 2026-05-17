import { fromEvent, merge, interval, EMPTY, Subject } from 'rxjs';
import {
  map, filter, scan, switchMap, distinctUntilChanged,
  startWith, shareReplay, tap, share, withLatestFrom,
} from 'rxjs/operators';

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Point     = { x: number; y: number };
type Status    = 'IDLE' | 'RUNNING' | 'PAUSED' | 'GAME_OVER';

type ParticleState = {
  x: number; y: number; vx: number; vy: number;
  color: string; life: number; maxLife: number;
};

type State = {
  snake:         Point[];
  food:          Point;
  direction:     Direction;
  nextDirection: Direction;
  score:         number;
  highScore:     number;
  status:        Status;
  speed:         number;
  particles:     ParticleState[];
  frame:         number;
};

type Action =
  | { type: 'START' }
  | { type: 'TICK' }
  | { type: 'SET_DIRECTION'; dir: Direction }
  | { type: 'TOGGLE_PAUSE' };

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_SIZE       = 20;
const CELL_SIZE       = 24;
const CANVAS_SIZE     = GRID_SIZE * CELL_SIZE;
const INITIAL_SPEED   = 150;
const SPEED_INCREMENT = 5;
const MIN_SPEED       = 60;

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
};

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'UP',   w: 'UP',   W: 'UP',
  ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
  ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
  ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const loadHighScore = (): number =>
  parseInt(localStorage.getItem('snakeHighScore') ?? '0');

const saveHighScore = (n: number): void =>
  localStorage.setItem('snakeHighScore', String(n));

const randomFood = (snake: Point[]): Point => {
  let pos: Point;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some(p => p.x === pos.x && p.y === pos.y));
  return pos;
};

const nextHead = (head: Point, dir: Direction): Point => ({
  UP:    { x: head.x,     y: head.y - 1 },
  DOWN:  { x: head.x,     y: head.y + 1 },
  LEFT:  { x: head.x - 1, y: head.y     },
  RIGHT: { x: head.x + 1, y: head.y     },
}[dir]);

const isOutOfBounds = (p: Point): boolean =>
  p.x < 0 || p.x >= GRID_SIZE || p.y < 0 || p.y >= GRID_SIZE;

const samePoint = (a: Point, b: Point): boolean =>
  a.x === b.x && a.y === b.y;

const makeFoodParticles = (food: Point): ParticleState[] =>
  Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 10;
    const speed = 1.5 + Math.random() * 2;
    return {
      x: food.x * CELL_SIZE + CELL_SIZE / 2,
      y: food.y * CELL_SIZE + CELL_SIZE / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: '#f97316', life: 20, maxLife: 20,
    };
  });

const makeDeathParticles = (snake: Point[]): ParticleState[] =>
  snake.flatMap(seg =>
    Array.from({ length: 3 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3;
      return {
        x: seg.x * CELL_SIZE + CELL_SIZE / 2,
        y: seg.y * CELL_SIZE + CELL_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: '#ef4444', life: 30, maxLife: 30,
      };
    })
  );

const stepParticles = (ps: ParticleState[]): ParticleState[] =>
  ps
    .filter(p => p.life > 0)
    .map(p => ({
      ...p,
      x: p.x + p.vx, y: p.y + p.vy,
      vx: p.vx * 0.92, vy: p.vy * 0.92,
      life: p.life - 1,
    }));

// ─── State & Reducer ──────────────────────────────────────────────────────────

const initialState = (): State => ({
  snake: [], food: { x: 0, y: 0 },
  direction: 'RIGHT', nextDirection: 'RIGHT',
  score: 0, highScore: loadHighScore(),
  status: 'IDLE', speed: INITIAL_SPEED,
  particles: [], frame: 0,
});

const startState = (highScore: number): State => {
  const snake: Point[] = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  return {
    snake, food: randomFood(snake),
    direction: 'RIGHT', nextDirection: 'RIGHT',
    score: 0, highScore, status: 'RUNNING',
    speed: INITIAL_SPEED, particles: [], frame: 0,
  };
};

function reduce(state: State, action: Action): State {
  switch (action.type) {

    case 'START':
      return startState(state.highScore);

    case 'TOGGLE_PAUSE':
      if (state.status === 'RUNNING') return { ...state, status: 'PAUSED' };
      if (state.status === 'PAUSED')  return { ...state, status: 'RUNNING' };
      return startState(state.highScore);

    case 'SET_DIRECTION':
      if (state.status !== 'RUNNING') return state;
      if (action.dir === OPPOSITE[state.direction]) return state;
      return { ...state, nextDirection: action.dir };

    case 'TICK': {
      if (state.status !== 'RUNNING') return state;

      const dir        = state.nextDirection;
      const head       = nextHead(state.snake[0], dir);
      const particles  = stepParticles(state.particles);

      if (isOutOfBounds(head) || state.snake.some(p => samePoint(p, head))) {
        return {
          ...state, status: 'GAME_OVER',
          particles: [...particles, ...makeDeathParticles(state.snake)],
        };
      }

      const ate   = samePoint(head, state.food);
      const snake = ate
        ? [head, ...state.snake]
        : [head, ...state.snake.slice(0, -1)];

      if (!ate) {
        return { ...state, direction: dir, snake, particles, frame: state.frame + 1 };
      }

      const score     = state.score + 10;
      const highScore = Math.max(score, state.highScore);
      if (highScore > state.highScore) saveHighScore(highScore);

      return {
        ...state, direction: dir, snake,
        food:       randomFood(snake),
        score, highScore,
        speed:      Math.max(MIN_SPEED, state.speed - SPEED_INCREMENT),
        particles:  [...particles, ...makeFoodParticles(state.food)],
        frame:      state.frame + 1,
      };
    }

    default:
      return state;
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * CELL_SIZE); ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE); ctx.stroke();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: ParticleState[]): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawEyes(ctx: CanvasRenderingContext2D, head: Point, dir: Direction): void {
  const cx = head.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = head.y * CELL_SIZE + CELL_SIZE / 2;
  const off = 5;
  const r   = 2.5;
  const [e1x, e1y, e2x, e2y] = ({
    RIGHT: [cx + 3, cy - off, cx + 3, cy + off],
    LEFT:  [cx - 3, cy - off, cx - 3, cy + off],
    UP:    [cx - off, cy - 3, cx + off, cy - 3],
    DOWN:  [cx - off, cy + 3, cx + off, cy + 3],
  } as Record<Direction, number[]>)[dir];

  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(e1x, e1y, r,     0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(e2x, e2y, r,     0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(e1x, e1y, r / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(e2x, e2y, r / 2, 0, Math.PI * 2); ctx.fill();
}

function drawFood(ctx: CanvasRenderingContext2D, food: Point, frame: number): void {
  const fx    = food.x * CELL_SIZE + CELL_SIZE / 2;
  const fy    = food.y * CELL_SIZE + CELL_SIZE / 2;
  const pulse = 0.85 + 0.15 * Math.sin(frame * 0.15);
  const fr    = (CELL_SIZE / 2 - 2) * pulse;
  const grad  = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
  grad.addColorStop(0,   '#fff7ed');
  grad.addColorStop(0.4, '#f97316');
  grad.addColorStop(1,   '#c2410c');
  ctx.shadowBlur = 16; ctx.shadowColor = '#f97316';
  ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;
}

function drawSnake(ctx: CanvasRenderingContext2D, snake: Point[], direction: Direction): void {
  snake.forEach((seg, i) => {
    const x     = seg.x * CELL_SIZE;
    const y     = seg.y * CELL_SIZE;
    const alpha = 1 - (i / snake.length) * 0.5;

    if (i === 0) {
      ctx.shadowBlur = 20; ctx.shadowColor = '#22c55e';
      const grad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
      grad.addColorStop(0, `rgba(134,239,172,${alpha})`);
      grad.addColorStop(1, `rgba(21,128,61,${alpha})`);
      roundRect(ctx, x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, 6);
      ctx.fillStyle = grad; ctx.fill();
      ctx.shadowBlur = 0;
      drawEyes(ctx, seg, direction);
    } else {
      const grad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
      grad.addColorStop(0, `rgba(74,222,128,${alpha})`);
      grad.addColorStop(1, `rgba(22,101,52,${alpha})`);
      roundRect(ctx, x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, 4);
      ctx.fillStyle = grad; ctx.fill();
    }
  });
}

function render(ctx: CanvasRenderingContext2D, state: State): void {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  drawGrid(ctx);
  drawParticles(ctx, state.particles);
  if (state.status === 'IDLE') return;
  drawFood(ctx, state.food, state.frame);
  drawSnake(ctx, state.snake, state.direction);
  if (state.status === 'PAUSED') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }
}

function updateDOM(state: State): void {
  document.getElementById('score')!.textContent      = String(state.score);
  document.getElementById('high-score')!.textContent = String(state.highScore);
  document.getElementById('state-label')!.textContent =
    state.status === 'PAUSED'    ? 'PAUSE'     :
    state.status === 'GAME_OVER' ? 'GAME OVER' : '';

  const overlay = document.getElementById('game-over-overlay')!;
  if (state.status === 'GAME_OVER') {
    document.getElementById('final-score')!.textContent = String(state.score);
    overlay.classList.add('visible');
  } else {
    overlay.classList.remove('visible');
  }

  if (state.status !== 'IDLE') {
    document.getElementById('start-overlay')!.classList.add('hidden');
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const canvas      = document.getElementById('game-canvas') as HTMLCanvasElement;
  canvas.width      = CANVAS_SIZE;
  canvas.height     = CANVAS_SIZE;
  const ctx         = canvas.getContext('2d')!;
  const action$     = new Subject<Action>();

  // ── Input streams ──────────────────────────────────────────────────────────

  const PREVENT_KEYS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter']);

  const keydown$ = fromEvent<KeyboardEvent>(document, 'keydown').pipe(
    tap(e => { if (PREVENT_KEYS.has(e.key)) e.preventDefault(); }),
    share(),
  );

  const directionAction$ = keydown$.pipe(
    map(e => KEY_TO_DIR[e.key] as Direction | undefined),
    filter((dir): dir is Direction => dir !== undefined),
    map(dir => ({ type: 'SET_DIRECTION', dir } as Action)),
  );

  const pauseAction$ = keydown$.pipe(
    filter(e => e.key === ' '),
    map((): Action => ({ type: 'TOGGLE_PAUSE' })),
  );

  const startAction$ = merge(
    fromEvent(document.getElementById('btn-start')!,   'click'),
    fromEvent(document.getElementById('btn-restart')!, 'click'),
    keydown$.pipe(filter(e => e.key === 'Enter')),
  ).pipe(map((): Action => ({ type: 'START' })));

  // ── Touch → direction (swipe) ──────────────────────────────────────────────

  const touchStart$ = fromEvent<TouchEvent>(canvas, 'touchstart', { passive: false } as AddEventListenerOptions).pipe(
    tap(e => e.preventDefault()),
    map(e => ({ x: e.touches[0].clientX, y: e.touches[0].clientY })),
    share(),
  );

  const swipeAction$ = fromEvent<TouchEvent>(canvas, 'touchend', { passive: false } as AddEventListenerOptions).pipe(
    tap(e => e.preventDefault()),
    withLatestFrom(touchStart$),
    map(([end, start]) => {
      const dx  = end.changedTouches[0].clientX - start.x;
      const dy  = end.changedTouches[0].clientY - start.y;
      const dir: Direction = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'RIGHT' : 'LEFT')
        : (dy > 0 ? 'DOWN'  : 'UP');
      return { type: 'SET_DIRECTION', dir } as Action;
    }),
  );

  // ── State stream ───────────────────────────────────────────────────────────

  const INIT   = initialState();
  const state$ = action$.pipe(
    scan(reduce, INIT),
    startWith(INIT),
    shareReplay(1),
  );

  // ── Auto-tick: emits TICK at current speed only while RUNNING ──────────────

  const tick$ = state$.pipe(
    map(s => s.status === 'RUNNING' ? s.speed : null),
    distinctUntilChanged(),
    switchMap(speed =>
      speed !== null
        ? interval(speed).pipe(map((): Action => ({ type: 'TICK' })))
        : EMPTY
    ),
  );

  // ── Wire all actions into the subject ──────────────────────────────────────

  merge(directionAction$, pauseAction$, startAction$, swipeAction$, tick$)
    .subscribe(action$);

  // ── Side effects: render canvas + update DOM ───────────────────────────────

  state$.subscribe(state => {
    render(ctx, state);
    updateDOM(state);
  });
});
