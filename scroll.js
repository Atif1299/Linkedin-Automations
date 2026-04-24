/**
 * Scroll Humanization Module
 * 
 * Human-like scrolling with variable speed, read pauses,
 * and occasional scroll-back behavior.
 */

class HumanScroller {
  constructor(page, config = {}) {
    this.page = page;
    this.config = {
      readPauseMin: config.readPauseMin || 3000,
      readPauseMax: config.readPauseMax || 8000,
      skipPauseMin: config.skipPauseMin || 500,
      skipPauseMax: config.skipPauseMax || 2000,
      distanceMin: config.distanceMin || 200,
      distanceMax: config.distanceMax || 600,
      scrollBackProbability: config.scrollBackProbability || 0.08,
      fastScroll: Boolean(config.fastScroll),
      ...config,
    };
  }

  _randomDelay(min, max) {
    return min + Math.random() * (max - min);
  }

  async _getFeedContainer() {
    const selectors = ['#workspace', 'main', '.scaffold-finite-scroll'];
    for (const selector of selectors) {
      const el = await this.page.$(selector);
      if (el) return el;
    }
    return null;
  }

  /**
   * Scroll down by a random distance with easing
   */
  async scrollDown(distance) {
    const scrollDist = distance || this._randomDelay(
      this.config.distanceMin,
      this.config.distanceMax
    );
    const delta = Math.round(scrollDist);
    const container = await this._getFeedContainer();

    if (this.config.programmaticFeedScroll) {
      if (container) {
        // Bulletproof scroll: directly manipulate the container's scroll position smoothly
        await container.evaluate((el, y) => el.scrollBy({ top: y, behavior: 'smooth' }), delta);
      } else {
        // Fallback
        await this.page.keyboard.press('PageDown');
        await this._sleep(100);
        await this.page.keyboard.press('PageDown');
      }
      
      // Wait for content to load
      await this._sleep(this._randomDelay(400, 800));
      return;
    }

    const fast = this.config.fastScroll;
    const steps = fast
      ? 3 + Math.floor(Math.random() * 2)
      : 8 + Math.floor(Math.random() * 6);
    const stepSize = scrollDist / steps;
    const stepSleepMin = fast ? 6 : 15;
    const stepSleepMax = fast ? 18 : 40;
    const settleMin = fast ? 40 : 100;
    const settleMax = fast ? 120 : 300;

    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      const easedStep = stepSize * (1 - Math.pow(progress, 2) * 0.5);

      if (container) {
        await container.evaluate((el, y) => el.scrollBy(0, y), easedStep);
      } else {
        await this.page.mouse.wheel(0, easedStep);
      }
      await this._sleep(this._randomDelay(stepSleepMin, stepSleepMax));
    }

    await this._sleep(this._randomDelay(settleMin, settleMax));
  }

  /**
   * Scroll back up slightly (like scrolling past something and coming back)
   */
  async scrollBackUp(distance) {
    const scrollDist = distance || this._randomDelay(100, 250);
    const steps = 5 + Math.floor(Math.random() * 3);
    const stepSize = scrollDist / steps;
    const container = await this._getFeedContainer();

    for (let i = 0; i < steps; i++) {
      if (container) {
        await container.evaluate((el, y) => el.scrollBy(0, -y), stepSize);
      } else {
        await this.page.mouse.wheel(0, -stepSize);
      }
      await this._sleep(this._randomDelay(20, 50));
    }

    await this._sleep(this._randomDelay(200, 500));
  }

  /**
   * Pause to "read" a post we're interested in
   */
  async readPause() {
    await this._sleep(this._randomDelay(
      this.config.readPauseMin,
      this.config.readPauseMax
    ));
  }

  /**
   * Brief pause for a post we're skipping
   */
  async skipPause() {
    await this._sleep(this._randomDelay(
      this.config.skipPauseMin,
      this.config.skipPauseMax
    ));
  }

  /**
   * Scroll through the feed, yielding visible posts
   * This is a generator that scrolls and finds posts one at a time
   */
  async scrollFeed(postSelector, options = {}) {
    const { maxScrolls = 100 } = options;
    const seenPostIds = new Set();
    const posts = [];

    for (let scroll = 0; scroll < maxScrolls; scroll++) {
      // Get currently visible posts
      const visiblePosts = await this.page.$$(postSelector);

      for (const post of visiblePosts) {
        const postId = await post.getAttribute('data-urn').catch(() => null);
        if (!postId || seenPostIds.has(postId)) continue;

        seenPostIds.add(postId);
        posts.push({ element: post, postId });
      }

      // Scroll down
      await this.scrollDown();

      // Occasionally scroll back up (human behavior)
      if (Math.random() < this.config.scrollBackProbability) {
        await this.scrollBackUp();
        await this._sleep(this._randomDelay(500, 1500));
      }

      // Check if we've reached the end of loaded content
      const atBottom = await this.page.evaluate(() => {
        const container = document.querySelector('#workspace') || document.querySelector('main');
        if (container) {
          return container.scrollTop + container.clientHeight >= container.scrollHeight - 200;
        }
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;
        return scrollTop + clientHeight >= scrollHeight - 200;
      });

      if (atBottom) {
        // Wait for more content to load
        await this._sleep(this._randomDelay(2000, 4000));

        // Check again — if still at bottom, we're done
        const stillAtBottom = await this.page.evaluate(() => {
          const container = document.querySelector('#workspace') || document.querySelector('main');
          if (container) {
            return container.scrollTop + container.clientHeight >= container.scrollHeight - 200;
          }
          const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
          const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
          const clientHeight = document.documentElement.clientHeight;
          return scrollTop + clientHeight >= scrollHeight - 200;
        });

        if (stillAtBottom) break;
      }
    }

    return posts;
  }

  /**
   * Scroll to a specific element with human-like approach
   */
  async scrollToElement(selector) {
    const element = await this.page.$(selector);
    if (!element) return false;

    const box = await element.boundingBox();
    if (!box) return false;

    const viewport = this.page.viewportSize();
    const targetY = box.y - viewport.height * 0.3; // Position element at ~30% from top

    // Scroll in chunks toward the target
    let currentScroll = await this.page.evaluate(() =>
      document.documentElement.scrollTop || document.body.scrollTop
    );

    const distance = targetY - currentScroll;
    if (Math.abs(distance) < 50) return true;

    const direction = distance > 0 ? 1 : -1;
    const chunks = 3 + Math.floor(Math.random() * 4);
    const chunkSize = distance / chunks;

    for (let i = 0; i < chunks; i++) {
      await this.page.mouse.wheel(0, chunkSize);
      await this._sleep(this._randomDelay(50, 120));
    }

    await this._sleep(this._randomDelay(200, 500));
    return true;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HumanScroller;
