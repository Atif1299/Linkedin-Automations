/**
 * Opens Playwright via Orchestrator, loads LinkedIn feed, tests post detection.
 * Usage: node automation-smoke.js
 */

require('dotenv').config();
const Orchestrator = require('./orchestrator');
const config = require('./schmoozzer.json');
const selectors = require('./linkedin-selectors');

config.supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
config.supabaseKey = process.env.SUPABASE_KEY || config.supabaseKey;
config.commentApiUrl = process.env.COMMENT_API_URL || config.commentApiUrl;
config.dryRun = true;

(async () => {
  console.log('=== AUTOMATION SMOKE TEST ===\n');
  
  const o = new Orchestrator(config);
  console.log('1. Initializing browser...');
  await o.init();
  
  console.log('2. Navigating to LinkedIn feed...');
  await o.page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  
  // Wait for feed to load
  console.log('3. Waiting for feed container...');
  try {
    await o.page.waitForSelector('[data-testid="mainFeed"]', { timeout: 30000 });
    console.log('   [OK] Feed container found');
  } catch (e) {
    console.log('   [WARN] Feed container not found via data-testid, checking alternative...');
    try {
      await o.page.waitForSelector('[data-component-type="LazyColumn"]', { timeout: 10000 });
      console.log('   [OK] Feed container found via LazyColumn');
    } catch (e2) {
      console.log('   [FAIL] Feed container not found');
    }
  }
  
  // Wait for page to fully load
  console.log('4. Waiting for page to fully load...');
  await new Promise(r => setTimeout(r, 2000));
  
  // Focus the page body using Tab key
  console.log('5. Scrolling feed container to load posts...');
  let prevPostCount = 0;
  
  for (let i = 0; i < 5; i++) {
    // Scroll the container directly
    await o.page.evaluate(() => {
      const feed = document.querySelector('#workspace') || document.querySelector('main');
      if (feed) {
        feed.scrollBy({ top: 1200, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 1200, behavior: 'smooth' });
      }
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // Check post count
    const posts = await o._extractVisiblePosts();
    console.log(`   Scroll ${i + 1}: ${posts.length} posts visible`);
    
    if (posts.length > prevPostCount) {
      prevPostCount = posts.length;
    }
  }
  
  // Test post detection
  console.log('7. Testing post detection...');
  const posts = await o._extractVisiblePosts();
  console.log(`   Found ${posts.length} posts`);
  
  if (posts.length > 0) {
    console.log('\n   Sample posts:');
    for (let i = 0; i < Math.min(3, posts.length); i++) {
      const p = posts[i];
      console.log(`   [${i + 1}] ${p.authorName || '(no author)'}`);
      console.log(`       PostID: ${p.postId?.substring(0, 50) || '(none)'}...`);
      console.log(`       Text: ${(p.text || '').substring(0, 80)}...`);
      console.log(`       Timestamp: ${p.timestamp || '(none)'}`);
      console.log('');
    }
  }
  
  // Test selector counts on page
  console.log('8. Testing individual selectors...');
  
  const selectorTests = [
    { name: 'Feed container', sel: selectors.feed.container },
    { name: 'Post cards (primary)', sel: selectors.feed.postCardPrimary },
    { name: 'Post cards (full)', sel: selectors.feed.postCard },
    { name: 'Post text', sel: selectors.feed.postText },
    { name: 'Author links', sel: selectors.feed.authorLink },
    { name: 'Comment buttons', sel: selectors.feed.commentButton },
    { name: 'Buttons with Comment text', sel: 'button:has-text("Comment")' },
    { name: 'role=listitem elements', sel: '[role="listitem"]' },
    { name: 'componentkey*=FeedType', sel: '[componentkey*="FeedType"]' },
  ];
  
  for (const test of selectorTests) {
    try {
      const count = await o.page.locator(test.sel).count();
      const status = count > 0 ? '[OK]' : '[WARN]';
      console.log(`   ${status} ${test.name}: ${count} found`);
    } catch (e) {
      console.log(`   [FAIL] ${test.name}: selector error - ${e.message}`);
    }
  }
  
  console.log('\n=== SMOKE TEST COMPLETE ===');
  console.log(`Result: ${posts.length > 0 ? 'SUCCESS' : 'NEEDS ATTENTION'} - ${posts.length} posts detected`);
  
  await o.cleanup();
})().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
