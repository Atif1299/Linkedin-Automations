/**
 * Follower Module — Follow Target Companies
 * 
 * Based on TUTORIAL.md PHASE 6: FOLLOW AUTOMATION
 * 1. Query Supabase for unfollowed companies
 * 2. Navigate to company LinkedIn page
 * 3. Click Follow button
 * 4. Verify follow was successful
 * 5. Update Supabase
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

class CompanyFollower {
  constructor(config) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.browser = null;
    this.page = null;
    this.running = false;
    /** @type {null | { phase: string, companyName: string | null, index: number, total: number }} */
    this.live = null;
  }

  async init() {
    logger.info('Initializing follower browser...');

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

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    logger.info('Follower browser initialized');
  }

  /**
   * Get unfollowed companies from Supabase
   */
  async getUnfollowedCompanies(limit = 25) {
    const { data, error } = await this.supabase
      .from('targets')
      .select('id, company_name, linkedin_company')
      .eq('followed', false)
      .not('linkedin_company', 'is', null)
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch unfollowed companies:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Follow a single company with flexible modal handling
   * Handles the "Turn on notifications" modal that appears after following
   */
  async followCompany(companyUrl) {
    logger.info(`Navigating to: ${companyUrl}`);
    
    await this.page.goto(companyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this._sleep(this._randomDelay(2000, 4000));

    const result = await this.page.evaluate(async () => {
      const FOLLOW_SELECTOR = '.org-top-card-primary-actions__inner button.org-company-follow-button';
      const MODAL_SELECTOR = '.artdeco-modal';

      const followButton = document.querySelector(FOLLOW_SELECTOR);
      if (!followButton) {
        return { success: false, reason: 'button_not_found' };
      }

      if (followButton.classList.contains('is-following') || followButton.innerText.includes('Following')) {
        return { success: true, reason: 'already_followed' };
      }

      followButton.click();

      return new Promise((resolve) => {
        let attempts = 0;
        let modalDismissed = false;
        
        const interval = setInterval(() => {
          const btn = document.querySelector(FOLLOW_SELECTOR);
          const isFollowed = btn && (btn.classList.contains('is-following') || btn.innerText.includes('Following'));

          // Dismiss modal if it appears (notifications prompt)
          if (!modalDismissed) {
            const modalOutlet = document.querySelector('#artdeco-modal-outlet');
            const modal = document.querySelector('.artdeco-modal');
            const activeModal = modalOutlet || modal;
            
            if (activeModal) {
              // Find "Not now" button by text
              const allButtons = document.querySelectorAll('button');
              for (const button of allButtons) {
                if (button.innerText.trim() === 'Not now') {
                  button.click();
                  modalDismissed = true;
                  break;
                }
              }
              
              // Fallback: try X close button
              if (!modalDismissed) {
                const closeBtn = activeModal.querySelector('button[aria-label="Dismiss"]') ||
                               activeModal.querySelector('button.artdeco-modal__dismiss') ||
                               activeModal.querySelector('button[data-test-modal-close-btn]');
                if (closeBtn) {
                  closeBtn.click();
                  modalDismissed = true;
                }
              }
            }
          }

          // Success - button changed to Following
          if (isFollowed) {
            clearInterval(interval);
            resolve({ success: true, modalDismissed });
          }

          // Timeout after 6 seconds
          if (attempts > 12) {
            clearInterval(interval);
            const stillFollowed = btn && btn.innerText.includes('Following');
            resolve({ 
              success: stillFollowed, 
              reason: stillFollowed ? 'success_with_timeout' : 'failed_to_follow',
              modalDismissed
            });
          }
          attempts++;
        }, 500);
      });
    });

    return result;
  }

  /**
   * Update Supabase after successful follow
   */
  async updateFollowStatus(companyId) {
    const { error } = await this.supabase
      .from('targets')
      .update({
        followed: true,
        followed_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    if (error) {
      logger.error(`Failed to update follow status for ${companyId}:`, error);
      return false;
    }

    return true;
  }

  /**
   * Run the follow session
   */
  async run(options = {}) {
    const { maxFollows = 20, dryRun = false } = options;
    this.running = true;
    this.live = { phase: 'fetching', companyName: null, index: 0, total: 0 };

    logger.info(`Starting follow session: target ${maxFollows} follows (dryRun: ${dryRun})`);

    const companies = await this.getUnfollowedCompanies(maxFollows);
    logger.info(`Found ${companies.length} unfollowed companies`);

    const total = companies.length;
    this.live = { phase: 'following', companyName: null, index: 0, total };

    let followedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      if (!this.running) break;

      if (!company.linkedin_company) {
        logger.debug(`Skip: No LinkedIn URL for ${company.company_name}`);
        skippedCount++;
        this.live = {
          phase: 'following',
          companyName: company.company_name,
          index: i + 1,
          total,
        };
        continue;
      }

      logger.info(`Processing: ${company.company_name}`);
      this.live = {
        phase: 'following',
        companyName: company.company_name,
        index: i + 1,
        total,
      };

      const result = await this.followCompany(company.linkedin_company);

      if (result.success) {
        if (result.reason === 'already_followed') {
          logger.info(`Already following: ${company.company_name}`);
        } else {
          logger.info(`Followed: ${company.company_name}`);
        }

        if (!dryRun) {
          await this.updateFollowStatus(company.id);
        }

        followedCount++;
      } else {
        logger.warn(`Failed to follow ${company.company_name}: ${result.reason}`);
        skippedCount++;
      }

      const delay = this._randomDelay(30000, 120000);
      this.live = {
        phase: 'cooldown',
        companyName: company.company_name,
        index: i + 1,
        total,
      };
      logger.info(`Waiting ${Math.round(delay / 1000)}s before next follow...`);
      await this._sleep(delay);
    }

    this.live = { phase: 'done', companyName: null, index: total, total };
    logger.info(`Follow session ended: ${followedCount} followed, ${skippedCount} skipped`);

    return { followed: followedCount, skipped: skippedCount };
  }

  stop() {
    this.running = false;
    logger.info('Follow session stop requested');
  }

  async cleanup() {
    this.stop();
    this.live = null;
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

module.exports = CompanyFollower;
