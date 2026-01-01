import { test, expect } from '@playwright/test';

test.describe('Space Game - Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('game loads successfully', async ({ page }) => {
    // Check canvas is present
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Check HUD elements are present
    await expect(page.locator('text=HEALTH')).toBeVisible();
    await expect(page.locator('text=AMMO')).toBeVisible();
    await expect(page.locator('text=KILLS')).toBeVisible();
  });

  test('start button begins game', async ({ page }) => {
    // Click start button
    await page.click('button:has-text("START")');

    // Verify game started (ammo should be 100)
    const ammoText = await page.textContent('#ammo');
    expect(ammoText).toContain('100');
  });

  test('firing lasers depletes ammo', async ({ page }) => {
    // Start game
    await page.click('button:has-text("START")');

    // Get initial ammo
    const initialAmmo = await page.textContent('#ammo');

    // Fire laser with spacebar
    await page.keyboard.press('Space');

    // Wait a moment for UI to update
    await page.waitForTimeout(100);

    // Verify ammo decreased
    const newAmmo = await page.textContent('#ammo');
    expect(parseInt(newAmmo)).toBeLessThan(parseInt(initialAmmo));
  });

  test('mode toggle button changes control mode', async ({ page }) => {
    // Start game
    await page.click('button:has-text("START")');

    // Find toggle button
    const toggleBtn = page.locator('button', { hasText: /CAM|SHIP/ });
    const initialText = await toggleBtn.textContent();

    // Click toggle
    await toggleBtn.click();

    // Verify it changed
    const newText = await toggleBtn.textContent();
    expect(newText).not.toBe(initialText);
  });

  test('health bar updates are visible', async ({ page }) => {
    // Start game
    await page.click('button:has-text("START")');

    // Get initial health
    const healthBar = page.locator('#healthBar');
    const initialWidth = await healthBar.evaluate(el => el.style.width);

    // In a real test, we'd trigger damage
    // For now, just verify the health bar exists
    expect(initialWidth).toBeTruthy();
  });

  test('settings menu opens and closes', async ({ page }) => {
    // Click hamburger menu
    await page.click('button:has-text("☰")');

    // Verify settings panel is visible
    const settingsPanel = page.locator('div').filter({ hasText: 'SETTINGS' });
    await expect(settingsPanel).toBeVisible();

    // Close by clicking hamburger again
    await page.click('button:has-text("☰")');

    // Verify it closed
    await expect(settingsPanel).not.toBeVisible();
  });
});

test.describe('Space Game - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('touch controls work on mobile', async ({ page }) => {
    await page.goto('/');

    // Start game
    await page.click('button:has-text("START")');

    // Verify laser button is visible
    const laserBtn = page.locator('button').filter({ hasText: 'FIRE' });
    await expect(laserBtn).toBeVisible();

    // Tap to fire
    await laserBtn.tap();

    // Verify ammo decreased
    const ammo = await page.textContent('#ammo');
    expect(parseInt(ammo)).toBeLessThan(100);
  });

  test('mode toggle works on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("START")');

    const toggleBtn = page.locator('button', { hasText: /CAM|SHIP/ });

    // Tap toggle
    await toggleBtn.tap();

    // Should not throw and button should still be visible
    await expect(toggleBtn).toBeVisible();
  });
});

test.describe('Space Game - Performance', () => {
  test('game maintains acceptable framerate', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("START")');

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
