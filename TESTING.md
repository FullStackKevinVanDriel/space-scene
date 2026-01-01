# Testing Framework for Space Game

## Overview
Comprehensive testing strategy covering unit tests, integration tests, and end-to-end tests.

---

## Testing Stack

### Core Testing Tools
- **Jest** - Unit and integration testing
- **Playwright** - End-to-end browser testing
- **@testing-library/dom** - DOM testing utilities
- **jest-canvas-mock** - Mock canvas for Three.js

### CI/CD Integration
- GitHub Actions for automated testing
- Run tests on every PR
- Block merge if tests fail

---

## Test Categories

### 1. Unit Tests (Game Logic)

Test individual functions in isolation:

```javascript
// Example: tests/unit/gameLogic.test.js
describe('Asteroid Spawning', () => {
  test('asteroids spawn within distance range', () => {
    const asteroid = createAsteroid();
    const distance = asteroid.position.length();
    expect(distance).toBeGreaterThanOrEqual(ASTEROID_SPAWN_MIN_DISTANCE);
    expect(distance).toBeLessThanOrEqual(ASTEROID_SPAWN_MAX_DISTANCE);
  });

  test('asteroid velocity points toward Earth', () => {
    const asteroid = createAsteroid();
    const direction = asteroid.userData.velocity.clone().normalize();
    const toEarth = new THREE.Vector3(0, 0, 0).sub(asteroid.position).normalize();
    const alignment = direction.dot(toEarth);
    expect(alignment).toBeGreaterThan(0.99); // Should be very aligned
  });
});
```

**What to Test:**
- [ ] Asteroid spawning (position, velocity, health)
- [ ] Collision detection math
- [ ] Health calculations
- [ ] Score calculations
- [ ] Level progression logic
- [ ] Speed calculations
- [ ] Ammo system
- [ ] Angel asteroid spawn conditions

### 2. Integration Tests (Component Interaction)

Test how systems work together:

```javascript
// Example: tests/integration/gameplay.test.js
describe('Laser Firing System', () => {
  test('firing depletes ammo and creates laser bolts', () => {
    const initialAmmo = laserAmmo;
    fireLasers();
    expect(laserAmmo).toBe(initialAmmo - 1);
    expect(laserBolts.length).toBe(2); // Two cannons
  });

  test('aim assist targets correct asteroid', () => {
    // Create asteroids at different positions
    const nearAsteroid = createAsteroid();
    const farAsteroid = createAsteroid();

    // Fire at near asteroid
    fireLasers();

    // Verify aim assist picked the right target
    // (test implementation would verify laser direction)
  });
});
```

**What to Test:**
- [ ] Laser firing → ammo depletion → bolt creation
- [ ] Asteroid hit → health reduction → destruction
- [ ] Angel asteroid spawn → player at low health
- [ ] Asteroid-Earth collision → damage → game over
- [ ] Level up → increased difficulty
- [ ] Control mode switching
- [ ] Sound system triggers

### 3. End-to-End Tests (Full Gameplay)

Test actual user scenarios in a real browser:

```javascript
// Example: tests/e2e/gameplay.spec.js
test('complete game flow', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for game to load
  await page.waitForSelector('canvas');

  // Start game
  await page.click('button:has-text("START")');

  // Fire lasers
  await page.keyboard.press('Space');

  // Verify ammo decreased
  const ammo = await page.textContent('#ammo');
  expect(ammo).toContain('99'); // Started with 100

  // Play for a bit and verify score increases
  await page.waitForTimeout(5000);
  const kills = await page.textContent('#kills');
  expect(parseInt(kills)).toBeGreaterThan(0);
});
```

**What to Test:**
- [ ] Game loads correctly
- [ ] Start button works
- [ ] Keyboard controls work
- [ ] Touch controls work (mobile)
- [ ] Score updates
- [ ] Health decreases when hit
- [ ] Game over triggers
- [ ] Sound plays (with mocking)
- [ ] Settings persist
- [ ] Pause/resume works

### 4. Visual Regression Tests

Ensure rendering doesn't break:

```javascript
// Example: tests/visual/rendering.spec.js
test('game renders correctly', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');

  // Take screenshot
  await expect(page).toHaveScreenshot('game-start.png', {
    maxDiffPixels: 100
  });
});
```

**What to Test:**
- [ ] Initial game state
- [ ] HUD elements
- [ ] Asteroid rendering
- [ ] Explosion effects
- [ ] Health bars
- [ ] Targeting reticles

---

## Test File Structure

```
space-scene/
├── tests/
│   ├── unit/
│   │   ├── gameLogic.test.js
│   │   ├── collision.test.js
│   │   ├── scoring.test.js
│   │   └── spawning.test.js
│   ├── integration/
│   │   ├── gameplay.test.js
│   │   ├── controls.test.js
│   │   └── audio.test.js
│   ├── e2e/
│   │   ├── gameplay.spec.js
│   │   ├── mobile.spec.js
│   │   └── desktop.spec.js
│   ├── visual/
│   │   └── rendering.spec.js
│   ├── fixtures/
│   │   └── testData.js
│   └── setup/
│       ├── jest.setup.js
│       └── playwright.config.js
├── jest.config.js
├── playwright.config.js
└── package.json (updated with test scripts)
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
# Unit/Integration testing
npm install --save-dev jest @testing-library/dom jest-canvas-mock jest-environment-jsdom

# E2E testing
npm install --save-dev @playwright/test

# Three.js mocking
npm install --save-dev jest-webgl-canvas-mock
```

### 2. Jest Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['jest-canvas-mock', './tests/setup/jest.setup.js'],
  testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
  collectCoverageFrom: ['public/script.js'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
```

### 3. Playwright Configuration

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 8080,
  },
});
```

### 4. Package.json Scripts

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:visual": "playwright test tests/visual"
  }
}
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

---

## Test Coverage Goals

| Category | Target Coverage |
|----------|----------------|
| Game Logic | 90% |
| UI Components | 80% |
| Event Handlers | 85% |
| Overall | 80% |

---

## Testing Best Practices

### 1. Test Isolation
- Each test should be independent
- Clean up after each test (reset game state)
- Don't rely on test execution order

### 2. Mocking
- Mock Three.js for unit tests
- Mock audio for headless testing
- Mock random values for deterministic tests

### 3. Assertions
- Test one thing per test
- Use descriptive test names
- Include edge cases

### 4. Performance
- Keep unit tests fast (<50ms each)
- Use `test.skip()` for slow tests during development
- Run E2E tests in parallel

---

## Example Test Implementations

### Mock Setup for Three.js

```javascript
// tests/setup/jest.setup.js
import * as THREE from 'three';

// Mock WebGL renderer
global.WebGLRenderingContext = jest.fn();
global.WebGL2RenderingContext = jest.fn();

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));
```

### Testing Collision Detection

```javascript
// tests/unit/collision.test.js
describe('Collision Detection', () => {
  test('detects asteroid-Earth collision', () => {
    const asteroid = {
      position: new THREE.Vector3(2, 0, 0),
      userData: { size: 1 }
    };

    const distance = asteroid.position.length();
    const hitRadius = EARTH_RADIUS + asteroid.userData.size * 0.5;

    expect(distance).toBeLessThan(hitRadius);
  });

  test('detects laser-asteroid hit', () => {
    const laser = { position: new THREE.Vector3(10, 10, 10) };
    const asteroid = {
      position: new THREE.Vector3(10.5, 10, 10),
      userData: { size: 1 }
    };

    const distance = laser.position.distanceTo(asteroid.position);
    const hitRadius = asteroid.userData.size + 0.3;

    expect(distance).toBeLessThan(hitRadius);
  });
});
```

---

## Next Steps

1. **Phase 1: Setup** (Week 1)
   - [ ] Install testing dependencies
   - [ ] Configure Jest and Playwright
   - [ ] Create test file structure
   - [ ] Set up CI/CD workflow

2. **Phase 2: Unit Tests** (Week 2)
   - [ ] Test game logic functions
   - [ ] Test calculations (scoring, collision)
   - [ ] Test state management

3. **Phase 3: Integration Tests** (Week 3)
   - [ ] Test gameplay systems
   - [ ] Test control systems
   - [ ] Test audio system

4. **Phase 4: E2E Tests** (Week 4)
   - [ ] Test full gameplay flows
   - [ ] Test mobile interactions
   - [ ] Test desktop interactions

5. **Phase 5: Visual Tests** (Week 5)
   - [ ] Set up visual regression
   - [ ] Create baseline screenshots
   - [ ] Test critical UI states

---

## Maintenance

- Run tests before every commit
- Update tests when adding features
- Review coverage reports monthly
- Fix flaky tests immediately
- Keep test dependencies updated
