# Spécification technique — Snake Game

## 1. Vue d'ensemble

Jeu Snake classique jouable dans un navigateur, sans backend ni dépendance réseau à l'exécution. Rendu via Canvas 2D, logique réactive en TypeScript avec RxJS, esthétique rétro CRT.

---

## 2. Structure du projet

```
snake-game/
├── index.html          # Point d'entrée HTML
├── src/
│   ├── snake.ts        # Source TypeScript (logique + rendu)
│   ├── snake.js        # Bundle compilé par esbuild (généré)
│   └── style.css       # Styles
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

---

## 3. Stack technique

| Élément         | Choix                          | Version   |
|-----------------|-------------------------------|-----------|
| Langage         | TypeScript (strict)           | ^5.4      |
| Réactivité      | RxJS                          | ^7.8      |
| Bundler         | esbuild                       | ^0.21     |
| Rendu           | Canvas 2D (API native)        | —         |
| Styles          | CSS vanilla + variables CSS   | —         |
| Persistance     | `localStorage`                | —         |
| Déploiement     | Fichiers statiques (no server)| —         |

---

## 4. Architecture

### 4.1 Pattern général

L'architecture suit le pattern **Redux-like avec RxJS** :

```
Actions (streams) ──► action$ (Subject) ──► scan(reduce) ──► state$ ──► side effects
                                                                │
                                              tick$ ◄──────────┘  (feedback loop)
```

- **Aucun état mutable** en dehors du `Subject<Action>`
- La fonction `reduce` est **pure** : même entrée → même sortie
- Le rendu et les mises à jour DOM sont des **effets de bord** dans `subscribe`

### 4.2 Flux de données

```
keydown$       ──┐
pauseAction$   ──┤
startAction$   ──┼──► merge ──► action$ ──► state$ ──► render(ctx, state)
swipeAction$   ──┤                                  └──► updateDOM(state)
tick$          ──┘
  ▲                   │
  └───── state$.pipe(switchMap(interval(speed))) ──── feedback
```

---

## 5. Modèle de données

### 5.1 Types primitifs

```typescript
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Point     = { x: number; y: number };
type Status    = 'IDLE' | 'RUNNING' | 'PAUSED' | 'GAME_OVER';
```

### 5.2 État global (`State`)

| Champ           | Type             | Description                                |
|-----------------|------------------|--------------------------------------------|
| `snake`         | `Point[]`        | Segments du serpent, tête en index 0       |
| `food`          | `Point`          | Position de la nourriture                  |
| `direction`     | `Direction`      | Direction effective du tick courant        |
| `nextDirection` | `Direction`      | Direction demandée (appliquée au prochain tick) |
| `score`         | `number`         | Score de la partie en cours                |
| `highScore`     | `number`         | Meilleur score (persisté en localStorage)  |
| `status`        | `Status`         | État de la machine à états                 |
| `speed`         | `number`         | Intervalle en ms entre deux ticks          |
| `particles`     | `ParticleState[]`| Particules actives                         |
| `frame`         | `number`         | Compteur de frames (animation nourriture)  |

### 5.3 Particule (`ParticleState`)

| Champ     | Type     | Description                          |
|-----------|----------|--------------------------------------|
| `x`, `y`  | `number` | Position en pixels                   |
| `vx`, `vy`| `number` | Vélocité en pixels/tick              |
| `color`   | `string` | Couleur CSS                          |
| `life`    | `number` | Durée de vie restante (ticks)        |
| `maxLife` | `number` | Durée de vie initiale (pour l'alpha) |

### 5.4 Actions

| Action            | Payload         | Déclencheur                              |
|-------------------|-----------------|------------------------------------------|
| `START`           | —               | Bouton JOUER, REJOUER, touche Entrée     |
| `TICK`            | —               | `interval(speed)` quand `RUNNING`        |
| `SET_DIRECTION`   | `dir: Direction`| Clavier (WASD/flèches), swipe mobile     |
| `TOGGLE_PAUSE`    | —               | Touche Espace                            |

---

## 6. Machine à états (`Status`)

```
         START                    START
  ┌──────────────────────────────────────────┐
  │                                          │
IDLE ──► RUNNING ──► GAME_OVER ──► RUNNING  │
              │                             │
         TOGGLE_PAUSE                       │
              │                             │
           PAUSED ──────────────────────────┘
              │            START / TOGGLE_PAUSE
              └──► RUNNING (TOGGLE_PAUSE)
```

| De → Vers           | Action          | Condition                    |
|---------------------|-----------------|------------------------------|
| `IDLE` → `RUNNING`  | `START`         | —                            |
| `RUNNING` → `PAUSED`| `TOGGLE_PAUSE`  | —                            |
| `PAUSED` → `RUNNING`| `TOGGLE_PAUSE`  | —                            |
| `RUNNING` → `GAME_OVER` | `TICK`     | Collision mur ou soi-même    |
| `GAME_OVER` → `RUNNING` | `START`    | —                            |
| `IDLE/GAME_OVER` → `RUNNING` | `TOGGLE_PAUSE` | Raccourci espace    |

---

## 7. Logique de jeu

### 7.1 Grille

- **20 × 20 cellules** de 24 px chacune → canvas de **480 × 480 px**

### 7.2 Tick (action `TICK`)

Séquence exécutée dans le reducer à chaque tick :

1. Appliquer `nextDirection` comme direction effective
2. Calculer la nouvelle tête (`nextHead`)
3. Mettre à jour les particules (`stepParticles`)
4. **Collision mur** : `x < 0 || x ≥ 20 || y < 0 || y ≥ 20` → `GAME_OVER`
5. **Collision soi-même** : tête dans `snake[]` → `GAME_OVER`
6. **Manger** : tête = food → ajouter tête sans retirer la queue
7. **Déplacer** : sinon ajouter tête + retirer la queue (`slice(0, -1)`)

### 7.3 Scoring

- **+10 points** par nourriture mangée
- Meilleur score persisté en `localStorage` (clé `snakeHighScore`)

### 7.4 Vitesse

- Départ : **150 ms** par tick
- **−5 ms** à chaque nourriture mangée
- Minimum : **60 ms** (vitesse maximale)

### 7.5 Collision de direction

Un demi-tour est impossible : `SET_DIRECTION` est ignoré si `dir === OPPOSITE[direction]`.

```typescript
const OPPOSITE = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
```

### 7.6 Nourriture

Positionnée aléatoirement sur une cellule **non occupée** par le serpent (boucle `do/while`).

---

## 8. Système de particules

### 8.1 Particules de nourriture (orange)

- **10 particules** par nourriture mangée
- Dispersées en cercle (angle = `2π × i / 10`)
- Vitesse initiale : `1.5 + random × 2` px/tick
- Durée de vie : **20 ticks**

### 8.2 Particules de mort (rouge)

- **3 particules** par segment du serpent
- Direction aléatoire, vitesse jusqu'à 3 px/tick
- Durée de vie : **30 ticks**

### 8.3 Simulation

À chaque tick, chaque particule :
- Déplace : `x += vx`, `y += vy`
- Décélère : `vx *= 0.92`, `vy *= 0.92`
- Vieillit : `life--`
- Alpha : `life / maxLife` (fade out)

---

## 9. Streams RxJS

### 9.1 Entrées clavier

```typescript
keydown$ = fromEvent<KeyboardEvent>(document, 'keydown').pipe(
  tap(e => preventDefault si touche de jeu),
  share()
)
```

Dérivés :
- `directionAction$` — mappe les touches WASD/flèches en `SET_DIRECTION`
- `pauseAction$` — espace → `TOGGLE_PAUSE`
- `startAction$` — boutons + Entrée → `START`

### 9.2 Swipe mobile

```typescript
touchStart$ = fromEvent(canvas, 'touchstart').pipe(map(coords), share())
swipeAction$ = fromEvent(canvas, 'touchend').pipe(
  withLatestFrom(touchStart$),
  map(([end, start]) => direction depuis dx/dy)
)
```

`withLatestFrom` élimine toute variable mutable pour le suivi du toucher.

### 9.3 Ticker auto-adaptatif

```typescript
tick$ = state$.pipe(
  map(s => s.status === 'RUNNING' ? s.speed : null),
  distinctUntilChanged(),
  switchMap(speed =>
    speed !== null ? interval(speed).pipe(map(() => TICK)) : EMPTY
  )
)
```

`switchMap` annule automatiquement l'intervalle précédent lors d'un changement de vitesse ou d'une pause — remplace entièrement la gestion manuelle de `clearTimeout`/`setTimeout`.

### 9.4 État

```typescript
state$ = action$.pipe(
  scan(reduce, initialState()),
  startWith(initialState()),
  shareReplay(1)    // multicast vers tick$ et subscribe
)
```

---

## 10. Rendu Canvas

Le rendu est **déclenché par chaque émission de `state$`** (pas de boucle `requestAnimationFrame` séparée).

### 10.1 Ordre de dessin (par frame)

1. **Fond** : rectangle plein `#0a0a0f`
2. **Grille** : lignes à 3% d'opacité
3. **Particules** : cercles avec `globalAlpha` proportionnel à `life/maxLife`
4. *(Si IDLE → stop)*
5. **Nourriture** : cercle avec dégradé radial + glow, rayon pulsé (`sin(frame × 0.15)`)
6. **Serpent** : segments avec dégradé linéaire, opacité décroissante vers la queue
   - Tête : coins arrondis r=6, glow vert, yeux
   - Corps : coins arrondis r=4
7. *(Si PAUSED)* : overlay noir semi-transparent

### 10.2 Yeux du serpent

Position des deux yeux calculée selon la direction :

| Direction | Œil 1         | Œil 2         |
|-----------|---------------|---------------|
| RIGHT     | `cx+3, cy−5`  | `cx+3, cy+5`  |
| LEFT      | `cx−3, cy−5`  | `cx−3, cy+5`  |
| UP        | `cx−5, cy−3`  | `cx+5, cy−3`  |
| DOWN      | `cx−5, cy+3`  | `cx+5, cy+3`  |

### 10.3 Palette

| Variable CSS   | Valeur      | Usage                  |
|----------------|-------------|------------------------|
| `--green`      | `#22c55e`   | Serpent, UI principale |
| `--green-dim`  | `#16a34a`   | Serpent (queue)        |
| `--orange`     | `#f97316`   | Nourriture, particules |
| `--red`        | `#ef4444`   | Game over, mort        |
| `--bg`         | `#050508`   | Fond de page           |
| `--glow`       | `rgba(34,197,94,0.35)` | Halos lumineux |

---

## 11. Interface utilisateur

### 11.1 Structure HTML

```
body
├── h1 "SNAKE"
├── .hud
│   ├── #score       ← mis à jour par updateDOM()
│   └── #high-score  ← mis à jour par updateDOM()
├── .canvas-wrap
│   ├── canvas#game-canvas
│   ├── #state-label          (PAUSE / GAME OVER, via CSS :not(:empty))
│   ├── #start-overlay        (masqué dès status ≠ IDLE)
│   └── #game-over-overlay    (visible quand status = GAME_OVER)
└── .controls (hint clavier)
```

### 11.2 Effets CSS

- **Scanlines** : `body::before` avec `repeating-linear-gradient` (4 px de répétition)
- **Vignette CRT** : `body::after` avec `radial-gradient` noir aux bords
- **Flicker titre** : keyframe `flicker` — opacité 0.85 à 95% du cycle sur 8 s
- **Bouton hover** : pseudo-élément `::before` avec `scaleX(0→1)` (fill animé)
- **Overlay game over** : `opacity: 0 → 1` via classe `.visible`

### 11.3 Typographies

| Police          | Usage                         |
|-----------------|-------------------------------|
| `Orbitron`      | Titre, HUD valeurs, overlays  |
| `Share Tech Mono` | Corps, hints, labels        |

Source : Google Fonts (chargé via `@import` dans le CSS).

---

## 12. Contrôles

| Entrée               | Action            |
|----------------------|-------------------|
| ↑ / W                | Direction haut    |
| ↓ / S                | Direction bas     |
| ← / A                | Direction gauche  |
| → / D                | Direction droite  |
| Espace               | Pause / Reprendre |
| Entrée               | Démarrer          |
| Swipe haut/bas/gauche/droite | Direction (mobile) |

---

## 13. Build & outils

### 13.1 Commandes

| Commande            | Effet                                          |
|---------------------|------------------------------------------------|
| `npm install`       | Installe RxJS + esbuild + TypeScript           |
| `npm run build`     | Bundle `src/snake.ts` → `src/snake.js`         |
| `npm run dev`       | Idem en mode watch (recompile à chaque sauvegarde) |
| `npm run typecheck` | Vérifie les types sans produire de fichier     |

### 13.2 Pourquoi esbuild et non `tsc` seul ?

`tsc` ne peut pas bundler les imports de modules externes (`rxjs`). esbuild résout les dépendances `node_modules` et produit un seul fichier JS autonome référençable depuis `index.html` sans module loader.

`tsc --noEmit` (`npm run typecheck`) reste utilisable pour la vérification de types.

### 13.3 Configuration esbuild

```
src/snake.ts  ──► bundle (inline rxjs) ──► src/snake.js  (~82 KB)
```

### 13.4 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2020", "DOM"]
  }
}
```

---

## 14. Persistance

| Clé localStorage    | Valeur  | Cycle de vie              |
|---------------------|---------|---------------------------|
| `snakeHighScore`    | entier  | Mis à jour dès qu'un nouveau record est atteint |

---

## 15. Décisions d'architecture notables

| Décision | Raison |
|---|---|
| RxJS `switchMap(interval(speed))` pour le ticker | Annulation automatique à chaque changement de vitesse ou pause — élimine `clearTimeout`/`setTimeout` manuels |
| État immutable + `scan(reduce)` | Facilite le débogage (chaque état est traceable), pas d'effets de bord dans la logique |
| `shareReplay(1)` sur `state$` | Permet à `tick$` et `subscribe` de partager le même flux sans re-exécuter le `scan` |
| `withLatestFrom(touchStart$)` pour le swipe | Évite toute variable mutable `let touchStartX` en dehors des streams |
| Particules dans le `State` | Mises à jour déterministes au tick, cohérence avec l'état de jeu, pas de boucle d'animation séparée |
| Pas de `requestAnimationFrame` | Le rendu au rythme du tick (~150 ms) est suffisant ; ajouter rAF complexifierait la gestion des particules sans gain visuel significatif pour ce style de jeu |
