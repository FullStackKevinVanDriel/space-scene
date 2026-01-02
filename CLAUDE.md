# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Space Scene is a 3D browser-based space shooter game built with Three.js. Players defend Earth by destroying asteroids across 10 levels with increasing difficulty. The game features a persistent leaderboard via Vercel serverless functions.

## Commands

```bash
# Development
npm install              # Install dependencies
node server.js           # Start Express server on port 3000

# Testing
npx jest tests/unit      # Run unit tests
npx jest tests/integration  # Run integration tests
npx playwright test      # Run E2E tests (requires: npx playwright install)
npx jest --coverage      # Generate coverage report

# Run a single test file
npx jest tests/unit/gameLogic.test.js
```

## Architecture

### Frontend (public/)
- `script.js` - Monolithic Three.js application (~4400 lines) containing all game logic
- `index.html` - Entry point, loads Three.js from CDN
- No build step required; runs directly in browser

### Backend
- `server.js` - Express server serving static files from `/public`
- `api/leaderboard.js` - Vercel serverless function for score persistence (uses Vercel KV in production, in-memory fallback locally)

### Key Game Systems in script.js
The file is organized into sections marked with `// === SECTION_NAME ===`:
- Scene setup, lighting, and celestial bodies (Earth, Moon, Sun)
- Spaceship rendering with hybrid 3D model
- Asteroid spawning and physics (speed scales 1.5x per level)
- Laser firing with aim assist and collision detection
- HUD and targeting reticles with occlusion handling
- Sound system via Web Audio API
- Input handling (keyboard, mouse, touch, gyroscope)
- Level progression and scoring

### Game State
Global state object tracks: health, ammo, kills, score, level, paused status. Ammo scales with level (40 per asteroid × asteroid count).

## Testing

Jest for unit/integration tests with jsdom environment and canvas mocking for Three.js. Playwright for E2E with multi-browser support (Chromium, Firefox, WebKit, mobile viewports). Tests run in CI on every PR via `.github/workflows/test.yml`.

## Deployment

Deploys to Vercel automatically on merge to main. `vercel.json` routes `/api/*` to serverless functions. No build step - static files served directly.

### IMPORTANT: Vercel Deployment Considerations

When making changes, always keep in mind this app deploys to Vercel:

1. **No local-only files**: Don't commit `.npmrc` or config files with local paths (e.g., `/home/username/...`) - these break Vercel builds
2. **package.json scripts**: Ensure all npm scripts referenced in CI workflows exist in package.json (`test:unit`, `test:integration`, `test:coverage`, `test:e2e`, `test:visual`)
3. **Static files only**: The `public/` folder is served as static files - no server-side rendering
4. **vercel.json**: Don't modify unless necessary; it configures routes for API and static files
5. **Jest config**: Use `jest.config.cjs` (CommonJS) since package.json has `"type": "module"`
6. **Test before pushing**: Run `npm run test:unit` locally to catch issues before CI

## Git Workflow

- Cannot push directly to `main`
- Create branches with `claude/` prefix for auto-merge workflow
- PRs trigger `.github/workflows/auto-merge-claude.yml` which auto-merges without approval
