import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  console.log('Navigating to http://localhost:3000');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const startBtn = await page.$('#startGameBtn');
  console.log('startGameBtn present:', !!startBtn);
  if (startBtn) {
    await startBtn.click();
    console.log('Clicked startGameBtn');
  }

  // Allow UI to initialize
  await page.waitForTimeout(1500);

  const modeBtn = await page.$('#modeToggleBtn');
  console.log('modeToggleBtn present:', !!modeBtn);
  if (modeBtn) {
    const box = await modeBtn.boundingBox();
    console.log('modeToggleBtn boundingBox:', box);
    const styles = await page.evaluate(el => {
      const s = getComputedStyle(el);
      return { display: s.display, visibility: s.visibility, opacity: s.opacity, pointerEvents: s.pointerEvents };
    }, modeBtn);
    console.log('modeToggleBtn computed styles:', styles);
    await page.screenshot({ path: 'modeToggle_debug.png' });
    console.log('Saved screenshot modeToggle_debug.png');
  }

  // List all buttons and their ids/text for inspection
  const buttons = await page.$$eval('button', els => els.map(b => ({ id: b.id || null, text: b.textContent && b.textContent.trim(), visible: (b.offsetWidth>0 && b.offsetHeight>0) } )));
  console.log('Buttons on page:', buttons);

  await browser.close();
  console.log('Done');
})();
