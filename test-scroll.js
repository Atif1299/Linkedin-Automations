const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('./chrome-data', { headless: false });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(5000);
  const feed = await page.$('[data-testid="mainFeed"]');
  if(feed) {
    const box = await feed.boundingBox();
    console.log('clicking', box.x + box.width / 2, box.y + 100);
    await page.mouse.click(box.x + box.width / 2, box.y + 100);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('End');
    await page.waitForTimeout(2000);
  }
  const p2 = await page.$$eval('[role="listitem"]', els => els.length);
  console.log('Posts after click+End:', p2);
  await browser.close();
})();
