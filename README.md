# 🐍 Snake Game — TypeScript

Jeu Snake classique avec rendu Canvas, effets de particules et esthétique rétro CRT.

## Lancer le jeu

Ouvrez simplement `index.html` dans votre navigateur. Aucun serveur ni installation requise.

## Fichiers

```
snake-game/
├── index.html        # Page principale
├── snake.js          # JS compilé (prêt à l'emploi)
├── src/
│   └── snake.ts      # Source TypeScript
└── README.md
```

## Compiler le TypeScript (optionnel)

```bash
npm install -g typescript
tsc src/snake.ts --target ES2020 --outFile snake.js
```

## Contrôles

| Touche            | Action     |
|-------------------|------------|
| ↑ ↓ ← → ou WASD  | Déplacer   |
| Espace            | Pause      |
| Entrée            | Démarrer   |
| Swipe (mobile)    | Déplacer   |

## Fonctionnalités

- Serpent avec yeux animés selon la direction
- Nourriture pulsante avec glow
- Système de particules (manger / mort)
- Accélération progressive
- Meilleur score sauvegardé en localStorage
- Effets scanlines & vignette CRT
- Support tactile (mobile)
