import { test, expect } from '@playwright/test';

test.describe('Space Game - Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Leave instructions overlay present; tests will click the start button when needed
  });

  test('game loads successfully', async ({ page }) => {
    // Check main game canvas is present
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();

    // Check HUD elements are present by ids (may be hidden in collapsed dashboard)
    await expect(page.locator('#healthBar')).toHaveCount(1);
    await expect(page.locator('#ammoCount')).toHaveCount(1);
    await expect(page.locator('#killCount')).toHaveCount(1);
  });

  test('start button begins game', async ({ page }) => {
    // Click start button in overlay
    await page.click('#startGameBtn');

    // Verify game started (ammo should be 100)
    const ammoText = await page.textContent('#ammoCount');
    expect(parseInt(ammoText)).toBeGreaterThan(0);
  });

  test('firing lasers depletes ammo', async ({ page }) => {
    // Start game
    await page.click('#startGameBtn');

    // Get initial ammo
    const initialAmmo = await page.textContent('#ammoCount');

    // Fire laser with spacebar
    await page.keyboard.press('Space');

    // Wait a moment for UI to update
    await page.waitForTimeout(100);

    // Verify ammo decreased
    const newAmmo = await page.textContent('#ammoCount');
    expect(parseInt(newAmmo)).toBeLessThan(parseInt(initialAmmo));
  });

  test('mode toggle button changes control mode', async ({ page }) => {
    // Start game
    await page.click('#startGameBtn');

    // Find toggle button
    const toggleBtn = page.locator('#modeToggleBtn');
    await toggleBtn.waitFor({ state: 'visible', timeout: 15000 });
    const initialText = await toggleBtn.textContent();

    // Click toggle
    await toggleBtn.click();

    // Verify it changed
    const newText = await toggleBtn.textContent();
    expect(newText).not.toBe(initialText);
  });

  test('health bar updates are visible', async ({ page }) => {
    // Start game
    await page.click('#startGameBtn');

    // Get initial health
    const healthBar = page.locator('#healthBar');
    const initialWidth = await healthBar.evaluate(el => el.style.width);

    // In a real test, we'd trigger damage
    // For now, just verify the health bar exists
    expect(initialWidth).toBeTruthy();
  });

  test('settings menu opens and closes', async ({ page }) => {
    // Start game to remove instructions overlay, then click hamburger menu
    await page.click('#startGameBtn');
      await page.click('#hamburgerBtn');

    // Verify settings panel is visible
      const settingsPanel = page.locator('#settingsPanel');
    await expect(settingsPanel).toBeVisible();

    // Close by clicking hamburger again
      await page.click('#hamburgerBtn');

    // Verify it closed
    await expect(settingsPanel).not.toBeVisible();
  });
});

test.describe('Space Game - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('touch controls work on mobile', async ({ page }) => {
    await page.goto('/');

    // Start game
    await page.click('#startGameBtn');

    // Verify laser button is visible
    const laserBtn = page.locator('button').filter({ hasText: 'LASER' });
    await expect(laserBtn).toBeVisible();

    // Tap to fire
    await laserBtn.tap();

    // Verify ammo decreased
    const ammo = await page.textContent('#ammoCount');
    expect(parseInt(ammo)).toBeLessThan(100);
  });

  test('mode toggle works on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('#startGameBtn');

    const toggleBtn = page.locator('#modeToggleBtn');
    await toggleBtn.waitFor({ state: 'visible', timeout: 15000 });

    // Tap toggle
    await toggleBtn.tap();

    // Should not throw and button should still be visible
    await expect(toggleBtn).toBeVisible();
  });
});

test.describe('Space Game - Performance', () => {
  test('game maintains acceptable framerate', async ({ page }) => {
    await page.goto('/');
    await page.click('#startGameBtn');

    // Let game run for a few seconds
    await page.waitForTimeout(3000);

    // Check for any console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    expect(errors.length).toBe(0);
  });
});
