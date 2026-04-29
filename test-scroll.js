const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('./chrome-data', { headless: false });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(5000);
  
  console.log('Testing scrollIntoView (works with LinkedIn virtual scroller)...');
  for (let i = 0; i < 5; i++) {
    // Use scrollIntoView on the last post
    await page.evaluate(() => {
      const posts = document.querySelectorAll('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]');
      if (posts.length > 0) {
        posts[posts.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
    
    await page.waitForTimeout(2000);
    
    const postCount = await page.$$eval('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]', els => els.length);
    console.log(`Scroll ${i + 1}: ${postCount} posts`);
  }
  
  const p2 = await page.$$eval('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]', els => els.length);
  console.log('Final post count:', p2);
  await browser.close();
})();
