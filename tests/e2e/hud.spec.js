import { test, expect } from '@playwright/test';

test.describe('Space Game - HUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('#startGameBtn');
    // Create deterministic, on-screen asteroids so HUD reticles appear reliably
    await page.evaluate(() => {
      try {
        // Clear existing asteroids
        if (window.asteroids && window.scene) {
          window.asteroids.forEach(a => { try { window.scene.remove(a); } catch(e){} });
          window.asteroids.length = 0;
        }

        // Helper to create an asteroid and place it in front of the camera
        for (let i = 0; i < 3; i++) {
          const a = typeof createAsteroid === 'function' ? createAsteroid() : null;
          if (!a) continue;
          // Place a short distance in front of the camera and slightly offset
          const dir = new THREE.Vector3();
          window.camera.getWorldDirection(dir);
          const distance = 25 + i * 8;
          const offset = new THREE.Vector3((i - 1) * 2.5, (i - 1) * 1.2, 0);
          const pos = window.camera.position.clone().add(dir.multiplyScalar(distance)).add(offset);
          a.position.copy(pos);
          // Ensure velocity points toward origin (earth) so ETA is calculable
          const v = new THREE.Vector3().sub(new THREE.Vector3(0,0,0), a.position).normalize().multiplyScalar(1 + i);
          a.userData.velocity = v;
          a.userData.createdAt = Date.now();
          // Add back to asteroids array if not already
          if (window.asteroids && !window.asteroids.includes(a)) window.asteroids.push(a);
        }
      } catch (e) {
        // ignore errors in test setup
      }
    });
    // Enable test hook so HUD is forced visible and occlusion is skipped
    await page.evaluate(() => { window.__TEST_forceShowHud = true; });

    // Force a HUD update immediately so reticles are created synchronously for tests
    await page.evaluate(() => {
      try {
        // Ensure occlusion check runs now
        window._hudFrameCount = (window._hudFrameCount || 0) + 5;
        if (typeof updateTargetingHUD === 'function') updateTargetingHUD();
      } catch (e) {}
    });
  });

  test('HUD reticles show distance and ETA', async ({ page }) => {
    // Wait for at least one reticle element to be attached (fast)
    const reticle = page.locator('.hudReticle').first();
    await reticle.waitFor({ state: 'attached', timeout: 5000 });

    const dist = await reticle.locator('.hudDist').textContent();
    // Expect distance (meters) and ETA (seconds) formatting
    expect(dist).toBeTruthy();
    expect(dist).toMatch(/m/);
    // ETA may be present; allow either
    expect(dist).toMatch(/s/);
  });

  test('HUD reticle shows numeric health label', async ({ page }) => {
    const reticle = page.locator('.hudReticle').first();
    await reticle.waitFor({ state: 'attached', timeout: 5000 });

    const healthText = await reticle.locator('.hudHealthText').textContent();
    expect(healthText).toBeTruthy();
    // Should contain digits (current/max or a number)
    expect(healthText).toMatch(/\d+/);
  });
});
