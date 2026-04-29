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

  /**
   * Scroll down by scrolling the last visible post into view
   * LinkedIn uses a virtual scroller - element.scrollIntoView() works reliably
   */
  async scrollDown(distance) {
    // Find the last visible post and scroll it into view
    // This triggers LinkedIn's lazy loading to add more posts
    const scrolled = await this.page.evaluate(() => {
      // Find all feed posts using componentkey pattern
      const posts = document.querySelectorAll('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]');
      if (posts.length === 0) {
        // Fallback: try other selectors
        const altPosts = document.querySelectorAll('[data-testid="mainFeed"] > div > div');
        if (altPosts.length > 2) {
          const lastPost = altPosts[altPosts.length - 1];
          lastPost.scrollIntoView({ behavior: 'smooth', block: 'end' });
          return true;
        }
        return false;
      }
      
      // Scroll the last post into view
      const lastPost = posts[posts.length - 1];
      lastPost.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return true;
    });

    // Wait for content to load
    await this._sleep(this._randomDelay(800, 1500));
    return scrolled;
  }

  /**
   * Scroll back up slightly (like scrolling past something and coming back)
   */
  async scrollBackUp(distance) {
    // Scroll a post near the top into view
    await this.page.evaluate(() => {
      const posts = document.querySelectorAll('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]');
      if (posts.length > 2) {
        // Scroll to a post 2-3 positions from current view
        const targetIndex = Math.max(0, posts.length - 3);
        posts[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    await this._sleep(this._randomDelay(300, 600));
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

      // Check if we've reached the end by seeing if new posts loaded
      const postCountBefore = await this.page.evaluate(() => {
        return document.querySelectorAll('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]').length;
      });

      // Wait for potential new content
      await this._sleep(this._randomDelay(1000, 2000));

      const postCountAfter = await this.page.evaluate(() => {
        return document.querySelectorAll('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]').length;
      });

      // If no new posts loaded after scrolling, we might be at the end
      if (postCountAfter <= postCountBefore) {
        // Wait longer and check again
        await this._sleep(this._randomDelay(2000, 3000));

        const finalCount = await this.page.evaluate(() => {
          return document.querySelectorAll('[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]').length;
        });

        if (finalCount <= postCountBefore) break;
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

    // Use scrollIntoView which works with LinkedIn's virtual scroller
    await element.evaluate((el) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    await this._sleep(this._randomDelay(300, 600));
    return true;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HumanScroller;
