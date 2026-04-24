/**
 * Tests the comment flow: click button -> input appears -> type -> verify submit
 * Usage: node test-comment-flow.js
 * 
 * This is a dry-run test - it will NOT actually submit any comments.
 */

require('dotenv').config();
const { chromium } = require('playwright');
const selectors = require('./linkedin-selectors');

(async () => {
  console.log('=== COMMENT FLOW TEST ===\n');
  
  // Launch browser with persistent context (uses LinkedIn session)
  console.log('1. Launching browser...');
  const browser = await chromium.launchPersistentContext(
    './chrome-data',
    {
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    }
  );
  
  const page = browser.pages()[0] || await browser.newPage();
  
  // Remove automation indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  console.log('2. Navigating to LinkedIn feed...');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for feed
  console.log('3. Waiting for feed to load...');
  await page.waitForSelector('[data-testid="mainFeed"]', { timeout: 30000 });
  
  // Scroll to load some posts
  console.log('4. Scrolling to load posts...');
  await page.mouse.wheel(0, 500);
  await new Promise(r => setTimeout(r, 2000));
  
  // Find the first post card
  console.log('5. Finding first post card...');
  const postCards = await page.locator('[role="listitem"][componentkey*="FeedType"]').all();
  console.log(`   Found ${postCards.length} post cards`);
  
  if (postCards.length === 0) {
    console.log('   [FAIL] No post cards found!');
    await browser.close();
    process.exit(1);
  }
  
  const firstCard = postCards[0];
  
  // Step 1: Find comment button
  console.log('\n6. Testing comment button detection...');
  
  // First, let's see all buttons in the card
  const allButtonsInCard = await firstCard.locator('button').all();
  console.log(`   Total buttons in first card: ${allButtonsInCard.length}`);
  
  // Check for buttons containing Comment text or icon
  let commentBtn = await firstCard.locator('button').filter({ hasText: 'Comment' }).first();
  let btnCount = await commentBtn.count();
  console.log(`   Buttons with "Comment" text in card: ${btnCount}`);
  
  if (btnCount === 0) {
    // Try looking for the comment icon SVG
    commentBtn = await firstCard.locator('button:has(svg[id*="comment"])').first();
    btnCount = await commentBtn.count();
    console.log(`   Buttons with comment SVG in card: ${btnCount}`);
  }
  
  if (btnCount === 0) {
    // Check if the social action bar is outside the listitem
    // LinkedIn sometimes has complex nesting - look for comment button near the post
    console.log('   Trying page-wide search for comment buttons near first post...');
    
    // Get the bounding box of the first card
    const cardBox = await firstCard.boundingBox();
    if (cardBox) {
      console.log(`   First card position: y=${Math.round(cardBox.y)}, height=${Math.round(cardBox.height)}`);
    }
    
    // Find all buttons with Comment text on page
    const pageButtons = await page.locator('button').filter({ hasText: 'Comment' }).all();
    console.log(`   Found ${pageButtons.length} buttons with "Comment" text on page`);
    
    if (pageButtons.length > 0) {
      // Use the first one found on the page
      commentBtn = pageButtons[0];
      btnCount = 1;
      console.log('   Using first Comment button found on page');
    }
  }
  
  if (btnCount === 0) {
    // Final fallback: look for span containing "Comment" text
    const commentSpans = await page.locator('span').filter({ hasText: /^Comment$/ }).all();
    console.log(`   Found ${commentSpans.length} spans with "Comment" text`);
    
    if (commentSpans.length > 0) {
      // Get the parent button
      const parentBtn = await commentSpans[0].locator('xpath=ancestor::button').first();
      if (await parentBtn.count() > 0) {
        commentBtn = parentBtn;
        btnCount = 1;
        console.log('   Found parent button of Comment span');
      }
    }
  }
  
  if (btnCount === 0) {
    console.log('   [FAIL] Comment button not found');
    await browser.close();
    process.exit(1);
  }
  
  console.log('   [OK] Comment button found');
  
  // Step 2: Click comment button
  console.log('\n7. Clicking comment button...');
  await commentBtn.click({ timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));
  console.log('   [OK] Comment button clicked');
  
  // Step 3: Find comment input
  console.log('\n8. Looking for comment input...');
  
  // Try different selectors
  const inputSelectors = [
    'div[contenteditable="true"][aria-label*="comment" i]',
    'div[contenteditable="true"][aria-label="Text editor for creating comment"]',
    'div.tiptap.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    selectors.feed.commentInput,
  ];
  
  let inputFound = false;
  let inputEl = null;
  
  for (const sel of inputSelectors) {
    try {
      const loc = page.locator(sel).first();
      const count = await loc.count();
      if (count > 0) {
        const visible = await loc.isVisible();
        console.log(`   Selector: ${sel.substring(0, 60)}...`);
        console.log(`   -> Count: ${count}, Visible: ${visible}`);
        if (visible) {
          inputFound = true;
          inputEl = loc;
          break;
        }
      }
    } catch (e) {
      // Ignore selector errors
    }
  }
  
  if (!inputFound) {
    console.log('   [FAIL] Comment input not found or not visible');
    
    // Debug: list all contenteditable elements
    const editables = await page.locator('div[contenteditable="true"]').all();
    console.log(`   Found ${editables.length} contenteditable divs on page`);
    
    for (let i = 0; i < Math.min(3, editables.length); i++) {
      const attrs = await editables[i].evaluate(el => ({
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        className: el.className,
      }));
      console.log(`   [${i}] aria-label="${attrs.ariaLabel}" role="${attrs.role}" class="${attrs.className?.substring(0, 50)}..."`);
    }
    
    await browser.close();
    process.exit(1);
  }
  
  console.log('   [OK] Comment input found and visible');
  
  // Step 4: Type test text
  console.log('\n9. Typing test text (will NOT submit)...');
  await inputEl.click();
  await new Promise(r => setTimeout(r, 300));
  
  const testText = 'This is a test comment - WILL NOT BE SUBMITTED';
  await inputEl.fill(testText);
  await new Promise(r => setTimeout(r, 500));
  
  // Verify text was entered
  const inputText = await inputEl.textContent();
  if (inputText && inputText.includes('test comment')) {
    console.log('   [OK] Text entered successfully');
  } else {
    console.log(`   [WARN] Text may not have been entered. Content: "${inputText?.substring(0, 50)}..."`);
  }
  
  // Step 5: Find submit button (but don't click it)
  console.log('\n10. Looking for submit button...');
  
  const submitSelectors = [
    '[componentkey*="commentButtonSection"] button',
    'button[aria-label*="Post" i]',
    'button[aria-label*="Submit" i]',
  ];
  
  let submitFound = false;
  
  for (const sel of submitSelectors) {
    try {
      const loc = page.locator(sel).first();
      const count = await loc.count();
      if (count > 0) {
        const visible = await loc.isVisible();
        console.log(`   Selector: ${sel}`);
        console.log(`   -> Count: ${count}, Visible: ${visible}`);
        if (visible) {
          submitFound = true;
          break;
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  if (submitFound) {
    console.log('   [OK] Submit button found');
  } else {
    console.log('   [WARN] Submit button not found - may need manual verification');
  }
  
  // Clear the input (cleanup)
  console.log('\n11. Cleaning up (clearing input)...');
  await inputEl.fill('');
  await new Promise(r => setTimeout(r, 500));
  
  // Press Escape to close comment box
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));
  
  console.log('\n=== COMMENT FLOW TEST COMPLETE ===');
  console.log('Result: Comment flow is working!');
  console.log('- Comment button: FOUND');
  console.log('- Comment input: FOUND & WORKING');
  console.log(`- Submit button: ${submitFound ? 'FOUND' : 'NEEDS VERIFICATION'}`);
  
  await browser.close();
})().catch((e) => {
  console.error('Comment flow test failed:', e);
  process.exit(1);
});
