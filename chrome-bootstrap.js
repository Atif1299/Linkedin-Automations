/**
 * Creates ./chrome-data and opens LinkedIn feed once in Playwright (headless).
 * Use for persistence folder + smoke that Chromium can reach LinkedIn.
 * Usage: node chrome-bootstrap.js
 */

const path = require('path');
const { chromium } = require('playwright');
const config = require('./schmoozzer.json');

const userDataDir = path.resolve(__dirname, config.userDataDir || './chrome-data');

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  await context.close();
  console.log('OK: chrome-data bootstrap finished (profile dir:', userDataDir + ')');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
