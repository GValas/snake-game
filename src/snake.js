"use strict";
// ─── Constants ───────────────────────────────────────────────────────────────
const GRID_SIZE = 20;
const CELL_SIZE = 24;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 5;
const MIN_SPEED = 60;

// ─── Particle ─────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, vx, vy, color, life) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color; this.life = life; this.maxLife = life;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.92; this.vy *= 0.92;
    this.life--;
  }
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3 * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────
class SnakeGame {
  constructor(canvas) {
    this.snake = [];
    this.food = { x: 0, y: 0 };
    this.direction = "RIGHT";
    this.nextDirection = "RIGHT";
    this.score = 0;
    this.highScore = 0;
    this.state = "IDLE";
    this.speed = INITIAL_SPEED;
    this.intervalId = null;
    this.particleSystem = [];
    this.frame = 0;

    this.canvas = canvas;
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.ctx = canvas.getContext("2d");
    this.highScore = parseInt(localStorage.getItem("snakeHighScore") ?? "0");
    this.setupControls();
    this.render();
  }

  setupControls() {
    document.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowUp": case "w": case "W":
          e.preventDefault();
          if (this.direction !== "DOWN") this.nextDirection = "UP";
          break;
        case "ArrowDown": case "s": case "S":
          e.preventDefault();
          if (this.direction !== "UP") this.nextDirection = "DOWN";
          break;
        case "ArrowLeft": case "a": case "A":
          e.preventDefault();
          if (this.direction !== "RIGHT") this.nextDirection = "LEFT";
          break;
        case "ArrowRight": case "d": case "D":
          e.preventDefault();
          if (this.direction !== "LEFT") this.nextDirection = "RIGHT";
          break;
        case " ":
          e.preventDefault();
          this.togglePause();
          break;
        case "Enter":
          e.preventDefault();
          if (this.state === "IDLE" || this.state === "GAME_OVER") this.start();
          break;
      }
    });
  }

  start() {
    this.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    this.direction = "RIGHT";
    this.nextDirection = "RIGHT";
    this.score = 0;
    this.speed = INITIAL_SPEED;
    this.particleSystem = [];
    this.placeFood();
    this.setState("RUNNING");
    this.updateScoreDisplay();
    this.scheduleNext();
  }

  togglePause() {
    if (this.state === "RUNNING") {
      this.setState("PAUSED");
      if (this.intervalId) clearTimeout(this.intervalId);
    } else if (this.state === "PAUSED") {
      this.setState("RUNNING");
      this.scheduleNext();
    } else if (this.state === "IDLE" || this.state === "GAME_OVER") {
      this.start();
    }
  }

  setState(s) {
    this.state = s;
    document.getElementById("state-label").textContent =
      s === "PAUSED" ? "PAUSE" : s === "GAME_OVER" ? "GAME OVER" : "";
  }

  scheduleNext() {
    this.intervalId = window.setTimeout(() => this.tick(), this.speed);
  }

  tick() {
    if (this.state !== "RUNNING") return;
    this.direction = this.nextDirection;
    const head = { ...this.snake[0] };
    switch (this.direction) {
      case "UP": head.y--; break;
      case "DOWN": head.y++; break;
      case "LEFT": head.x--; break;
      case "RIGHT": head.x++; break;
    }
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      this.gameOver(); return;
    }
    if (this.snake.some(p => p.x === head.x && p.y === head.y)) {
      this.gameOver(); return;
    }
    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.eatFood();
    } else {
      this.snake.pop();
    }
    this.frame++;
    this.render();
    this.scheduleNext();
  }

  eatFood() {
    this.score += 10;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("snakeHighScore", String(this.highScore));
    }
    this.speed = Math.max(MIN_SPEED, this.speed - SPEED_INCREMENT);
    this.spawnParticles(this.food.x, this.food.y);
    this.placeFood();
    this.updateScoreDisplay();
  }

  placeFood() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
    } while (this.snake.some(p => p.x === pos.x && p.y === pos.y));
    this.food = pos;
  }

  gameOver() {
    if (this.intervalId) clearTimeout(this.intervalId);
    this.setState("GAME_OVER");
    this.spawnDeathParticles();
    this.render();
    document.getElementById("final-score").textContent = String(this.score);
    document.getElementById("game-over-overlay").classList.add("visible");
  }

  spawnParticles(gx, gy) {
    const cx = gx * CELL_SIZE + CELL_SIZE / 2;
    const cy = gy * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const speed = 1.5 + Math.random() * 2;
      this.particleSystem.push(new Particle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, "#f97316", 20));
    }
  }

  spawnDeathParticles() {
    for (const seg of this.snake) {
      const cx = seg.x * CELL_SIZE + CELL_SIZE / 2;
      const cy = seg.y * CELL_SIZE + CELL_SIZE / 2;
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3;
        this.particleSystem.push(new Particle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, "#ef4444", 30));
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL_SIZE); ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE); ctx.stroke();
    }

    this.particleSystem = this.particleSystem.filter(p => p.life > 0);
    for (const p of this.particleSystem) { p.update(); p.draw(ctx); }

    if (this.state === "IDLE") return;

    // Food
    const fx = this.food.x * CELL_SIZE + CELL_SIZE / 2;
    const fy = this.food.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = 0.85 + 0.15 * Math.sin(this.frame * 0.15);
    const fr = (CELL_SIZE / 2 - 2) * pulse;
    const foodGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    foodGrad.addColorStop(0, "#fff7ed");
    foodGrad.addColorStop(0.4, "#f97316");
    foodGrad.addColorStop(1, "#c2410c");
    ctx.shadowBlur = 16; ctx.shadowColor = "#f97316";
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fillStyle = foodGrad; ctx.fill();
    ctx.shadowBlur = 0;

    // Snake
    for (let i = 0; i < this.snake.length; i++) {
      const seg = this.snake[i];
      const x = seg.x * CELL_SIZE, y = seg.y * CELL_SIZE;
      const t = i / this.snake.length;
      const alpha = 1 - t * 0.5;

      if (i === 0) {
        ctx.shadowBlur = 20; ctx.shadowColor = "#22c55e";
        const g = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        g.addColorStop(0, `rgba(134,239,172,${alpha})`);
        g.addColorStop(1, `rgba(21,128,61,${alpha})`);
        this.roundRect(ctx, x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, 6);
        ctx.fillStyle = g; ctx.fill();
        ctx.shadowBlur = 0;
        this.drawEyes(ctx, seg);
      } else {
        const g = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        g.addColorStop(0, `rgba(74,222,128,${alpha})`);
        g.addColorStop(1, `rgba(22,101,52,${alpha})`);
        this.roundRect(ctx, x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, 4);
        ctx.fillStyle = g; ctx.fill();
      }
    }

    if (this.state === "PAUSED") {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
  }

  drawEyes(ctx, head) {
    const cx = head.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = head.y * CELL_SIZE + CELL_SIZE / 2;
    const eyeOffset = 5, eyeR = 2.5;
    let e1x = cx, e1y = cy, e2x = cx, e2y = cy;
    switch (this.direction) {
      case "RIGHT": e1x = cx+3; e1y = cy-eyeOffset; e2x = cx+3; e2y = cy+eyeOffset; break;
      case "LEFT":  e1x = cx-3; e1y = cy-eyeOffset; e2x = cx-3; e2y = cy+eyeOffset; break;
      case "UP":    e1x = cx-eyeOffset; e1y = cy-3; e2x = cx+eyeOffset; e2y = cy-3; break;
      case "DOWN":  e1x = cx-eyeOffset; e1y = cy+3; e2x = cx+eyeOffset; e2y = cy+3; break;
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(e1x, e1y, eyeR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2x, e2y, eyeR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(e1x, e1y, eyeR/2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2x, e2y, eyeR/2, 0, Math.PI*2); ctx.fill();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  updateScoreDisplay() {
    document.getElementById("score").textContent = String(this.score);
    document.getElementById("high-score").textContent = String(this.highScore);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas");
  const game = new SnakeGame(canvas);

  document.getElementById("btn-start").addEventListener("click", () => {
    document.getElementById("game-over-overlay").classList.remove("visible");
    game.start();
  });

  document.getElementById("btn-restart").addEventListener("click", () => {
    document.getElementById("game-over-overlay").classList.remove("visible");
    game.start();
  });

  let touchStartX = 0, touchStartY = 0;
  canvas.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: dx > 0 ? "ArrowRight" : "ArrowLeft" }));
    } else {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: dy > 0 ? "ArrowDown" : "ArrowUp" }));
    }
    e.preventDefault();
  }, { passive: false });
});
