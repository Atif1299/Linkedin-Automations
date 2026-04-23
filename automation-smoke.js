/**
 * Opens Playwright via Orchestrator, loads LinkedIn feed, exits (no run loop).
 * Usage: node automation-smoke.js
 */

require('dotenv').config();
const Orchestrator = require('./orchestrator');
const config = require('./schmoozzer.json');

config.supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
config.supabaseKey = process.env.SUPABASE_KEY || config.supabaseKey;
config.commentApiUrl = process.env.COMMENT_API_URL || config.commentApiUrl;
config.dryRun = true;

(async () => {
  const o = new Orchestrator(config);
  await o.init();
  await o.page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  console.log('OK: LinkedIn feed loaded in automation browser');
  await o.cleanup();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
