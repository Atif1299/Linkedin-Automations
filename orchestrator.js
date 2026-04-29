/**
 * Orchestrator — Main Control Loop
 * 
 * Coordinates the entire automation:
 * schedule → session → scan → filter → generate → type → submit → break → repeat
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const HumanMouse = require('./mouse');
const HumanTyper = require('./typing');
const HumanScroller = require('./scroll');
const TimingEngine = require('./timing');
const PostFilter = require('./post-filter');
const VarietyChecker = require('./variety-checker');
const selectors = require('./linkedin-selectors');
const logger = require('./logger');

class Orchestrator {
  constructor(config) {
    this.config = config;
    this.dryRun = Boolean(config.dryRun);

    // Supabase
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);

    // Modules
    this.timing = new TimingEngine(config.timing);
    this.filter = new PostFilter(this.supabase, config.filter);
    this.variety = new VarietyChecker(config.variety);

    // Set after browser launch
    this.browser = null;
    this.page = null;
    this.mouse = null;
    this.typer = null;
    this.scroller = null;

    // State
    this.running = false;
    this.status = 'idle'; // idle, running, break, waiting, stopped
  }

  /**
   * Initialize browser with existing LinkedIn session
   */
  async init() {
    if (this.dryRun) {
      logger.info('AUTOMATION_DRY_RUN enabled - comments will be generated but not submitted to LinkedIn');
    }
    logger.info('Initializing browser...');

    // Launch browser using persistent context (preserves cookies/session)
    this.browser = await chromium.launchPersistentContext(
      this.config.userDataDir || './chrome-data',
      {
        headless: false,
        viewport: { width: 1440, height: 900 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
      }
    );

    this.page = this.browser.pages()[0] || await this.browser.newPage();

    // Remove automation indicators
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      delete navigator.__proto__.webdriver;
    });

    // Initialize humanization modules
    this.mouse = new HumanMouse(this.page, this.config.mouse);
    this.typer = new HumanTyper(this.page, this.config.typing);
    this.scroller = new HumanScroller(this.page, this.config.scroll);

    // Load filter data
    await this.filter.loadExclusionKeywords();
    await this.filter.loadTargetCompanies();

    logger.info('Browser initialized, filters loaded');
  }

  /**
   * Main run loop
   */
  async run() {
    this.running = true;
    logger.info('Orchestrator started');

    while (this.running) {
      try {
        // Check if it's a new day
        this.timing.checkNewDay();

        // Check operating hours
        const opStatus = this.timing.isOperatingTime();

        if (!opStatus.active) {
          this.status = 'waiting';
          const waitTime = this.timing.getTimeUntilNextWindow();
          logger.info(`Outside operating hours (${opStatus.reason}). Waiting ${Math.round(waitTime / 60000)} minutes`);

          // Wait, but check every 60s if we should stop
          await this._interruptibleWait(waitTime);
          continue;
        }

        // Start a session
        await this._runSession();

        // Take a break between sessions
        if (this.running) {
          this.status = 'break';
          const breakDuration = this.timing.getBreakDuration();
          logger.info(`Session complete. Taking a ${Math.round(breakDuration / 60000)} minute break`);

          await this._updateDailyStats();
          await this._interruptibleWait(breakDuration);
        }

      } catch (err) {
        logger.error('Orchestrator error:', err);

        // Check if it's a LinkedIn detection issue
        if (this._isDetectionError(err)) {
          logger.warn('Possible LinkedIn detection — stopping for 24 hours');
          this.status = 'stopped';
          // TODO: alert owner via email/notification
          await this._interruptibleWait(24 * 60 * 60 * 1000);
        } else {
          // Generic error — wait 5 minutes and retry
          await this._interruptibleWait(5 * 60 * 1000);
        }
      }
    }

    logger.info('Orchestrator stopped');
  }

  /**
   * Run a single session (7-10 comments then stop)
   */
  async _runSession() {
    this.status = 'running';
    const session = this.timing.startSession();
    logger.info(`Session started: target ${session.commentTarget} comments`);

    // Log session to database
    const { data: sessionRecord } = await this.supabase
      .from('sessions')
      .insert({
        started_at: session.startedAt.toISOString(),
        status: 'active',
      })
      .select()
      .single();

    // Navigate to LinkedIn feed
    logger.info('Opening LinkedIn feed...');
    await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await this._sleep(this.timing.getPostFeedSettleMs());
    const feedWaitSel = [
      selectors.feed.postCard,
      selectors.feed.postCardFallback || '',
      '[data-testid="mainFeed"]',
      '[data-component-type="LazyColumn"]',
    ]
      .filter(Boolean)
      .join(',')
      .replace(/,,+/g, ',')
      .replace(/^,|,$/g, '');
    try {
      await this.page.waitForSelector(feedWaitSel, { timeout: 45000, state: 'attached' });
    } catch (e) {
      logger.warn(
        `No feed post elements matched within 45s. URL: ${this.page.url()} - check LinkedIn login or selectors.`
      );
    }
    logger.info('Feed loaded, starting scan loop');

    let postsProcessed = 0;
    const maxPostsToScan = session.commentTarget * 8; // scan up to 8x target to find enough eligible posts
    let feedPass = 0;
    let maxVisibleEver = 0;

    while (
      session.commentsCompleted < session.commentTarget &&
      postsProcessed < maxPostsToScan &&
      this.running
    ) {
      // Check if still in operating hours
      const opCheck = this.timing.isOperatingTime();
      if (!opCheck.active) break;

      feedPass += 1;
      await this.scroller.scrollDown();
      await this._sleep(this.timing.getActionDelay('between_posts'));

      const posts = await this._extractVisiblePosts();
      maxVisibleEver = Math.max(maxVisibleEver, posts.length);
      logger.info(
        `Feed pass ${feedPass}: ${posts.length} card(s) visible; session ${session.commentsCompleted}/${session.commentTarget} comments`
      );

      if (feedPass >= 15 && maxVisibleEver === 0) {
        logger.error(
          `Still 0 post cards after ${feedPass} passes. URL: ${this.page.url()}. ` +
            'Fix: log into LinkedIn in this browser profile, dismiss any checkpoints, stay on /feed/. ' +
            'If already on the feed, update linkedin-selectors.js postCard / postCardFallback.'
        );
        break;
      }

      for (const post of posts) {
        if (session.commentsCompleted >= session.commentTarget) break;
        if (!this.running) break;

        postsProcessed++;
        session.postsScanned++;

        // Filter the post
        const filterResult = await this.filter.filterPost(post);

        if (!filterResult.pass) {
          session.postsSkipped++;
          logger.debug(`Skip: ${filterResult.reason} - ${(post.authorName || '').slice(0, 40)}`);
          
          // Only log if not already seen (avoid duplicate inserts)
          if (filterResult.reason !== 'already_seen') {
            await this.filter.logPost(post, filterResult);
          }

          // Brief pause even for skipped posts (we "saw" them)
          await this.scroller.skipPause();
          continue;
        }

        // Post passed all filters — read it
        await this.scroller.readPause();

        // Generate comment
        const comment = await this._generateComment(post);
        if (!comment) {
          await this.filter.logPost(post, filterResult);
          continue;
        }

        // Check variety
        const varietyResult = this.variety.check(comment);
        let finalComment = comment;

        if (!varietyResult.pass) {
          // Try to regenerate once
          const hint = this.variety.getRegenerationHint(varietyResult.violations);
          finalComment = await this._generateComment(post, hint);

          if (!finalComment) {
            await this.filter.logPost(post, filterResult);
            continue;
          }

          const recheck = this.variety.check(finalComment);
          if (!recheck.pass) {
            logger.debug('Comment failed variety check twice, skipping post');
            await this.filter.logPost(post, filterResult);
            continue;
          }
        }

        // Type and submit the comment
        await this._postComment(post, finalComment);

        // Record
        this.variety.record(finalComment);
        await this.filter.logPost(post, filterResult, finalComment, { dryRun: this.dryRun });

        await this.supabase.from('comment_log').insert({
          post_id: post.postId,
          target_id: filterResult.targetId,
          comment_text: finalComment,
          generated_at: new Date().toISOString(),
          posted_at: this.dryRun ? null : new Date().toISOString(),
          session_id: sessionRecord?.id,
          post_content_snippet: post.text?.substring(0, 200),
          status: this.dryRun ? 'dry_run' : 'posted',
        });

        const sessionStatus = this.timing.recordComment();
        logger.info(
          this.dryRun
            ? `Comment ${session.commentsCompleted}/${session.commentTarget} dry-run (not posted)`
            : `Comment ${session.commentsCompleted}/${session.commentTarget} posted`
        );

        if (!sessionStatus.continue) break;

        // Delay after posting
        await this._sleep(this.timing.getActionDelay('after_submit'));
      }
    }

    // Update session record
    if (sessionRecord) {
      await this.supabase
        .from('sessions')
        .update({
          ended_at: new Date().toISOString(),
          comments_made: session.commentsCompleted,
          posts_scanned: session.postsScanned,
          posts_skipped: session.postsSkipped,
          break_after: true,
          break_duration_minutes: Math.round(this.timing.getBreakDuration() / 60000),
          status: 'completed',
        })
        .eq('id', sessionRecord.id);
    }

    logger.info(`Session ended: ${session.commentsCompleted} comments, ${session.postsScanned} scanned, ${session.postsSkipped} skipped`);
  }

  /**
   * Extract post data from currently visible feed items
   */
  async _extractVisiblePosts() {
    return await this.page.evaluate((sel) => {
      // --- Extraction logic aligned to `main2.py` (Python) ---
      // Selectors from main2.py (the user says these are the correct ones)
      const PY_POST_SELECTOR = "div[role='listitem']";
      const PY_TEXT_SELECTOR = "[data-testid='expandable-text-box']";
      const PY_PROFILE_LINK_SELECTOR = "a[href*='/in/'], a[href*='/company/']";

      function cleanText(t) {
        return String(t || '').replace(/\s+/g, ' ').trim();
      }

      function isValidAuthorLine(line) {
        const clean = cleanText(line);
        if (!clean) return false;
        if (clean.length >= 80) return false;
        const low = clean.toLowerCase();
        if (low.includes('comment')) return false;
        if (low.includes('followers')) return false;
        if (low.includes('liked')) return false;
        if (low.includes('reposted')) return false;
        if (low.includes('hour')) return false;
        if (low.includes('ago')) return false;
        if (clean.includes('•')) return false;
        if (clean.includes('http')) return false;
        return true;
      }

      function extractAuthorPyStyle(postEl) {
        // Priority: scan sections after <hr>, skipping action-heavy sections
        try {
          const hrDivs = postEl.querySelectorAll('hr + div');
          if (hrDivs && hrDivs.length > 0) {
            for (const section of hrDivs) {
              const btnCount = section.querySelectorAll('button')?.length || 0;
              if (btnCount > 2) {
                continue;
              }
              const links = section.querySelectorAll(PY_PROFILE_LINK_SELECTOR);
              if (!links || links.length === 0) continue;

              const maxLinks = Math.min(links.length, 3);
              for (let j = 0; j < maxLinks; j++) {
                const link = links[j];
                const href = link?.getAttribute('href') || '';
                if (!href) continue;
                const raw = (link.textContent || '').trim();
                if (!raw) continue;
                const lines = raw.split('\n');
                for (const line of lines) {
                  if (isValidAuthorLine(line)) {
                    return {
                      authorName: cleanText(line),
                      authorUrl: href,
                    };
                  }
                }
              }
            }
          }
        } catch (e) {
          /* ignore */
        }

        // Fallback: scan the whole post for /in/ or /company/ links and pick first valid label
        try {
          const links = postEl.querySelectorAll(PY_PROFILE_LINK_SELECTOR);
          if (links && links.length > 0) {
            const maxLinks = Math.min(links.length, 8);
            for (let i = 0; i < maxLinks; i++) {
              const link = links[i];
              const href = link?.getAttribute('href') || '';
              if (!href) continue;
              const raw = (link.textContent || '').trim();
              if (!raw) continue;
              const lines = raw.split('\n');
              for (const line of lines) {
                if (isValidAuthorLine(line)) {
                  return {
                    authorName: cleanText(line),
                    authorUrl: href,
                  };
                }
              }
            }
          }
        } catch (e) {
          /* ignore */
        }

        return { authorName: '', authorUrl: '' };
      }

      function matchesPostCard(el) {
        if (!el || !el.matches) {
          return false;
        }
        
        // Check role="listitem" with componentkey containing FeedType (new LinkedIn layout)
        if (el.getAttribute('role') === 'listitem') {
          const ck = el.getAttribute('componentkey') || '';
          if (ck.includes('FeedType') || ck.includes('expanded')) {
            return true;
          }
        }
        
        // Try selector-based matching
        if (sel.feed.postCardPrimary) {
          try {
            if (el.matches(sel.feed.postCardPrimary)) {
              return true;
            }
          } catch (e) {
            /* ignore */
          }
        }
        const parts = String(sel.feed.postCard || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const part of parts) {
          try {
            if (el.matches(part)) {
              return true;
            }
          } catch (e) {
            /* ignore */
          }
        }
        
        // Fallback class checks
        const cls = el.className && String(el.className);
        return !!(cls && (cls.includes('_2174b9ce') || cls.includes('_04cc2b4d') || cls.includes('feed-shared')));
      }

      function collectPostRoots() {
        // Primary: find elements by role="listitem" with FeedType in componentkey
        let list = [...document.querySelectorAll('[role="listitem"][componentkey*="FeedType"]')];
        if (list.length > 0) {
          return list;
        }
        
        // Fallback to selector-based collection
        list = [...document.querySelectorAll(sel.feed.postCard)];
        if (list.length > 0) {
          return list;
        }
        
        // Final fallback using postCardFallback
        const fb = sel.feed.postCardFallback;
        if (!fb) {
          // Last resort: main2.py style selector (very broad, but we'll filter by text presence later)
          return [...document.querySelectorAll(PY_POST_SELECTOR)];
        }
        const nodes = [...document.querySelectorAll(fb)];
        const byKey = new Map();
        for (const node of nodes) {
          const ck = node.getAttribute('componentkey') || '';
          const key = ck || node.getAttribute('data-urn') || Math.random().toString();
          if (byKey.has(key)) {
            continue;
          }
          let card = node;
          let p = node.parentElement;
          for (let d = 0; d < 10 && p; d++) {
            if (matchesPostCard(p)) {
              card = p;
              break;
            }
            p = p.parentElement;
          }
          byKey.set(key, card);
        }
        return [...byKey.values()];
      }
      
      function extractPostId(el) {
        // Strategy 1: Look for URN in any componentkey attribute (nested elements too)
        const allWithCk = el.querySelectorAll('[componentkey]');
        for (const node of [el, ...allWithCk]) {
          const ck = node.getAttribute('componentkey') || '';
          // Match patterns like urn:li:ugcPost:7452736980557180928 or urn:li:activity:123456
          const urnMatch = ck.match(/urn:li:(ugcPost|activity):(\d+)/);
          if (urnMatch) {
            return `urn:li:${urnMatch[1]}:${urnMatch[2]}`;
          }
        }
        
        // Strategy 2: Look for data-testid with activity pattern
        const testIdEl = el.querySelector('[data-testid*="activity"], [data-testid*="ugcPost"]');
        if (testIdEl) {
          const tid = testIdEl.getAttribute('data-testid') || '';
          const tidMatch = tid.match(/(activity|ugcPost)[^-]*-?(\d+)/i);
          if (tidMatch) {
            return `urn:li:${tidMatch[1].toLowerCase()}:${tidMatch[2]}`;
          }
        }
        
        // Strategy 3: Fallback to data-urn
        const nestedUrn = el.querySelector('[data-urn]')?.getAttribute('data-urn');
        if (nestedUrn) {
          return nestedUrn;
        }
        
        // Strategy 4: Extract from main componentkey using the hash-like ID
        const mainCk = el.getAttribute('componentkey') || '';
        // Pattern like "expanded14NTEbCsBRqkzOiOW1Ab9ub_8yYgHsBVuJ3le70d98sFeedType"
        const hashMatch = mainCk.match(/expanded([a-zA-Z0-9_]+)FeedType/);
        if (hashMatch) {
          return `feed_${hashMatch[1]}`;
        }
        
        return el.getAttribute('data-urn') || el.dataset?.urn || null;
      }

      const posts = [];
      const elements = collectPostRoots();
      const seenIds = new Set();

      for (const el of elements) {
        const postId = extractPostId(el);
        
        // Deduplicate by postId
        if (postId && seenIds.has(postId)) {
          continue;
        }
        if (postId) {
          seenIds.add(postId);
        }
        
        // Find post text using main2.py's selector first
        let textEl = el.querySelector(PY_TEXT_SELECTOR);
        if (!textEl) textEl = el.querySelector('[data-testid="expandable-text-box"]');
        if (!textEl && sel.feed.postText) textEl = el.querySelector(sel.feed.postText);

        const pyAuthor = extractAuthorPyStyle(el);
        const authorName = pyAuthor.authorName || '';
        const authorUrl = pyAuthor.authorUrl || '';
        
        // Timestamp - look for patterns like "1d", "2h", "1w"
        let timestamp = '';
        const timestampEl = el.querySelector(sel.feed.postTimestamp);
        if (timestampEl) {
          timestamp = timestampEl.textContent?.trim() || '';
        } else {
          // Look for text matching time patterns
          const allText = el.querySelectorAll('p, span');
          for (const t of allText) {
            const txt = t.textContent?.trim() || '';
            if (/^\d+[hdwm]\s*(•|$)/.test(txt) || /^\d+\s*(hour|day|week|min)/i.test(txt)) {
              timestamp = txt;
              break;
            }
          }
        }
        
        const isJob = !!el.querySelector(sel.feed.jobBadge) || 
                      (el.textContent || '').toLowerCase().includes('job posting');

        const text = cleanText(textEl?.textContent || '');
        // Skip empty cards (broad selector can pick non-post listitems)
        if (!text) {
          continue;
        }

        posts.push({
          postId: postId || `unknown_${Date.now()}_${Math.random()}`,
          authorName: authorName,
          authorUrl: authorUrl,
          text,
          timestamp: timestamp,
          isJobPosting: isJob,
          type: isJob ? 'job' : 'post',
          _element: null, // Can't pass DOM elements out
        });
      }

      return posts;
    }, selectors);
  }

  /**
   * Generate a comment via the cloud API
   */
  async _generateComment(post, extraInstruction = '') {
    try {
      const response = await fetch(this.config.commentApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_text: post.text,
          post_author: post.authorName,
          extra_instruction: extraInstruction,
        }),
      });

      if (!response.ok) {
        logger.error(`Comment API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data.comment;
    } catch (err) {
      logger.error('Comment generation failed:', err);
      return null;
    }
  }

  /** CSS attribute value escape for selectors */
  _escapeSelector(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** Find post card by URN in componentkey attribute */
  _componentKeySelector(postId) {
    const id = this._escapeSelector(postId);
    return `[componentkey*="${id}"]`;
  }

  /** CSS attribute value escape for [data-urn="..."] */
  _dataUrnSelector(postId) {
    const id = this._escapeSelector(postId);
    return `[data-urn="${id}"]`;
  }

  /**
   * Post card scope: find the post card element containing the given postId
   * Tries multiple strategies: componentkey, role+componentkey, data-urn, class patterns
   */
  _postCardScope(postId) {
    // Strategy 1: Find by componentkey containing the URN
    const byComponentKey = this.page
      .locator(`[role="listitem"]`)
      .filter({ has: this.page.locator(this._componentKeySelector(postId)) })
      .first();
    
    // Strategy 2: Find by data-urn attribute
    const byDataUrn = this.page.locator(this._dataUrnSelector(postId)).first();
    
    // Strategy 3: Find listitem containing text that matches (fallback)
    const byListitem = this.page
      .locator('[role="listitem"][componentkey*="FeedType"]')
      .filter({ has: this.page.locator(this._componentKeySelector(postId)) })
      .first();
    
    // Strategy 4: Legacy class-based lookup
    const byLegacy = this.page
      .locator('.feed-shared-update-v2')
      .filter({ has: this.page.locator(this._dataUrnSelector(postId)) })
      .first();

    return { byComponentKey, byDataUrn, byListitem, byLegacy };
  }

  /**
   * Type and submit a comment on a post
   */
  async _postComment(post, comment) {
    if (this.dryRun) {
      logger.info('[DRY RUN] Skipping LinkedIn submit', {
        postId: post.postId,
        preview: comment.substring(0, 120),
      });
      return;
    }

    const { byComponentKey, byDataUrn, byListitem, byLegacy } = this._postCardScope(post.postId);
    
    // Try each strategy in order until we find the card
    let card = byComponentKey;
    if ((await card.count()) === 0) {
      card = byListitem;
    }
    if ((await card.count()) === 0) {
      card = byDataUrn;
    }
    if ((await card.count()) === 0) {
      card = byLegacy;
    }
    if ((await card.count()) === 0) {
      logger.warn('Could not find post element for commenting', { postId: post.postId });
      return;
    }

    // Find and click the comment button
    // The comment button might be inside the card or in a sibling element
    let btn = card.locator('button').filter({ hasText: 'Comment' }).first();
    
    if ((await btn.count()) === 0) {
      btn = card.locator('[componentkey*="commentButtonSection"] button').first();
    }
    if ((await btn.count()) === 0) {
      btn = card.locator('button:has(svg[id*="comment"])').first();
    }
    
    // If not found in card, try page-wide search for Comment button
    // (LinkedIn sometimes places the social bar outside the listitem)
    if ((await btn.count()) === 0) {
      const pageButtons = await this.page.locator('button').filter({ hasText: 'Comment' }).all();
      if (pageButtons.length > 0) {
        // Use the first visible one
        for (const pageBtn of pageButtons) {
          if (await pageBtn.isVisible()) {
            btn = pageBtn;
            break;
          }
        }
      }
    }
    
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 10000 }).catch((e) => {
        logger.debug('Comment button click failed:', e.message);
      });
      await this._sleep(this._randomDelay(400, 1200));
    } else {
      logger.warn('Comment button not found for post', { postId: post.postId });
      return;
    }

    // Wait for comment input to appear
    // Try aria-label based selector first (most stable)
    let inputLoc = card.locator('div[contenteditable="true"][aria-label*="comment" i]').first();
    if ((await inputLoc.count()) === 0) {
      inputLoc = card.locator('div.tiptap.ProseMirror[contenteditable="true"]').first();
    }
    if ((await inputLoc.count()) === 0) {
      inputLoc = card.locator('div[contenteditable="true"][role="textbox"]').first();
    }
    if ((await inputLoc.count()) === 0) {
      inputLoc = card.locator(selectors.feed.commentInput).first();
    }
    
    // Also check page-level (comment box might be outside card scope)
    if ((await inputLoc.count()) === 0) {
      inputLoc = this.page.locator('div[contenteditable="true"][aria-label*="comment" i]').first();
    }
    
    await inputLoc.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
    if ((await inputLoc.count()) === 0) {
      logger.warn('Comment input not found after clicking comment button');
      return;
    }

    await this._sleep(this.timing.getActionDelay('before_typing'));
    await inputLoc.click({ timeout: 8000 });
    await this._sleep(this._randomDelay(300, 600));

    await this.typer.typeText(comment);

    await this._sleep(this.timing.getActionDelay('after_typing'));

    // Find and click submit button
    // The submit button is the same as the comment button area after typing
    let submit = card.locator('[componentkey*="commentButtonSection"] button').first();
    if ((await submit.count()) === 0) {
      submit = this.page.locator('[componentkey*="commentButtonSection"] button').first();
    }
    if ((await submit.count()) === 0) {
      submit = card.locator(selectors.feed.commentSubmit).first();
    }
    
    if ((await submit.count()) > 0) {
      await submit.click({ timeout: 10000 }).catch((e) => {
        logger.debug('Submit button click failed:', e.message);
      });
    } else {
      logger.warn('Comment submit control not found');
    }
    await this._sleep(this._randomDelay(500, 1500));
  }

  async _updateDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    const plan = this.timing.dailyPlan;

    try {
      const { error } = await this.supabase.rpc('upsert_daily_stats', {
        p_date: today,
        p_comments: plan?.totalComments || 0,
        p_sessions: plan?.sessionsCompleted || 0,
      });
      if (error) {
        logger.error('Failed to update daily stats:', error);
      }
    } catch (err) {
      logger.error('Failed to update daily stats:', err);
    }
  }

  _isDetectionError(err) {
    const msg = (err.message || '').toLowerCase();
    return msg.includes('captcha') ||
           msg.includes('unusual activity') ||
           msg.includes('verify') ||
           msg.includes('challenge');
  }

  async _interruptibleWait(ms) {
    const interval = 60000; // Check every minute
    let remaining = ms;

    while (remaining > 0 && this.running) {
      const waitTime = Math.min(remaining, interval);
      await this._sleep(waitTime);
      remaining -= waitTime;
    }
  }

  stop() {
    this.running = false;
    this.status = 'stopped';
    logger.info('Stop requested');
  }

  async cleanup() {
    this.stop();
    if (this.browser) {
      await this.browser.close();
    }
  }

  _randomDelay(min, max) {
    return min + Math.random() * (max - min);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Orchestrator;
