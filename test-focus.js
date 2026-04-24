const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('./chrome-data', { headless: false });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(5000);
  
  // Try to set focus programmatically without clicking
  await page.evaluate(() => {
    const feed = document.querySelector('[data-testid="mainFeed"]');
    if(feed) {
      feed.setAttribute('tabindex', '-1');
      feed.focus();
    }
  });
  
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('End');
    await page.waitForTimeout(2000);
  }
  
  const posts = await page.$$eval('[role="listitem"]', els => els.length);
  console.log('Posts after focus+End:', posts);
  await browser.close();
})().catch(console.error);
