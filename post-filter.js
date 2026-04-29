/**
 * Post Filter Module
 * 
 * Determines whether a post should be commented on.
 * Checks: already seen, target company, job post, keywords, sensitivity, staleness.
 */

const { createClient } = require('@supabase/supabase-js');

class PostFilter {
  constructor(supabase, config = {}) {
    this.supabase = supabase;
    this.config = {
      maxPostAgeHours: config.maxPostAgeHours || 48,
      /** When true (default), only match targets with followed=true. Set false in schmoozzer.json to match any enriched company. */
      requireFollowedTarget: config.requireFollowedTarget !== false,
      ...config,
    };
    this.exclusionKeywords = [];
    this.targetCompanies = new Map(); // key -> target record (multiple keys per target)
    this.lastKeywordRefresh = 0;
    this.keywordRefreshInterval = 5 * 60 * 1000; // refresh every 5 minutes
  }

  _normalizeTextKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  _linkedinCompanySlug(url) {
    const s = String(url || '');
    if (!s) return null;
    // Accept relative or absolute URLs, and strip query/hash.
    // Examples:
    //  - https://www.linkedin.com/company/foo-bar/
    //  - /company/foo-bar/
    //  - https://www.linkedin.com/company/foo-bar?trk=...
    const m = s.match(/\/company\/([^\/?#]+)/i);
    if (!m) return null;
    const slug = (m[1] || '').trim().toLowerCase();
    return slug || null;
  }

  _addTargetKey(key, target) {
    const k = this._normalizeTextKey(key);
    if (!k) return;
    // Prefer first insert; don't overwrite to keep stable mapping
    if (!this.targetCompanies.has(k)) {
      this.targetCompanies.set(k, target);
    }
  }

  /**
   * Load exclusion keywords from Supabase
   */
  async loadExclusionKeywords() {
    const { data, error } = await this.supabase
      .from('exclusion_keywords')
      .select('keyword, category');

    if (error) {
      console.error('Failed to load exclusion keywords:', error);
      return;
    }

    this.exclusionKeywords = data.map(d => ({
      keyword: d.keyword.toLowerCase(),
      category: d.category,
    }));
    this.lastKeywordRefresh = Date.now();
  }

  /**
   * Load target companies from Supabase
   */
  async loadTargetCompanies() {
    let query = this.supabase
      .from('targets')
      .select('id, company_name, linkedin_company, followed')
      .not('linkedin_company', 'is', null);

    if (this.config.requireFollowedTarget !== false) {
      query = query.eq('followed', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to load targets:', error);
      return;
    }

    this.targetCompanies.clear();
    for (const target of data) {
      if (target.linkedin_company) {
        // Index by full URL and by extracted /company/<slug>
        this._addTargetKey(target.linkedin_company, target);
        const slug = this._linkedinCompanySlug(target.linkedin_company);
        if (slug) {
          this._addTargetKey(`company:${slug}`, target);
          this._addTargetKey(slug, target);
        }
      }
      // Also index by company name for fuzzy matching
      if (target.company_name) {
        this._addTargetKey(target.company_name, target);
      }
    }
  }

  /**
   * Ensure keywords are fresh
   */
  async _ensureKeywords() {
    if (Date.now() - this.lastKeywordRefresh > this.keywordRefreshInterval) {
      await this.loadExclusionKeywords();
    }
  }

  /**
   * Main filter — returns { pass: bool, reason: string, detail?: string }
   */
  async filterPost(post) {
    await this._ensureKeywords();

    // 1. Already seen?
    const seen = await this._checkAlreadySeen(post.postId);
    if (seen) return { pass: false, reason: 'already_seen' };

    // 2. From a target company?
    const target = this._checkIsTarget(post.authorName, post.authorUrl);
    if (!target) return { pass: false, reason: 'not_target' };

    // 3. Job post?
    if (this._isJobPost(post)) {
      return { pass: false, reason: 'job_post' };
    }

    // 4. Keyword exclusion?
    const keywordMatch = this._checkKeywords(post.text);
    if (keywordMatch) {
      return { pass: false, reason: 'keyword_match', detail: keywordMatch };
    }

    // 5. Too old?
    if (this._isTooOld(post.timestamp)) {
      return { pass: false, reason: 'too_old' };
    }

    // 6. All checks passed
    return { pass: true, reason: 'approved', targetId: target.id };
  }

  async _checkAlreadySeen(postId) {
    const { data } = await this.supabase
      .from('posts_seen')
      .select('id')
      .eq('post_id', postId)
      .limit(1);

    return data && data.length > 0;
  }

  _checkIsTarget(authorName, authorUrl) {
    if (!authorName && !authorUrl) return null;

    // Check by URL
    if (authorUrl) {
      const urlLower = this._normalizeTextKey(authorUrl);

      // Fast-path: match by LinkedIn /company/<slug>
      const authorSlug = this._linkedinCompanySlug(authorUrl);
      if (authorSlug) {
        const direct =
          this.targetCompanies.get(`company:${authorSlug}`) ||
          this.targetCompanies.get(authorSlug);
        if (direct) return direct;
      }

      // Fallback: substring match (legacy behavior)
      for (const [key, target] of this.targetCompanies) {
        if (urlLower.includes(key) || key.includes(urlLower)) return target;
      }
    }

    // Check by name
    if (authorName) {
      const nameLower = this._normalizeTextKey(authorName);
      const target = this.targetCompanies.get(nameLower);
      if (target) return target;

      // Fuzzy: check if company name is contained in author name or vice versa
      for (const [key, target] of this.targetCompanies) {
        if (nameLower.includes(key) || key.includes(nameLower)) {
          return target;
        }
      }
    }

    return null;
  }

  _isJobPost(post) {
    // Check for LinkedIn job post indicators
    if (post.isJobPosting) return true;

    // Check post text for job-related patterns
    const jobPatterns = [
      /we(?:'re| are) hiring/i,
      /job (?:opening|alert|opportunity)/i,
      /apply now/i,
      /join our team/i,
      /open position/i,
      /looking for a\s+\w+\s+(?:developer|designer|manager|engineer|analyst)/i,
      /#hiring\b/i,
      /#jobalert\b/i,
    ];

    if (post.text) {
      for (const pattern of jobPatterns) {
        if (pattern.test(post.text)) return true;
      }
    }

    return false;
  }

  _checkKeywords(text) {
    if (!text) return null;
    const textLower = text.toLowerCase();

    for (const { keyword } of this.exclusionKeywords) {
      // Word boundary check — don't match "therapist" when excluding "the"
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(textLower)) {
        return keyword;
      }
    }

    return null;
  }

  _isTooOld(timestamp) {
    if (!timestamp) return false; // If we can't determine age, let it through

    const postTime = new Date(timestamp);
    const now = new Date();
    const hoursOld = (now - postTime) / (1000 * 60 * 60);

    return hoursOld > this.config.maxPostAgeHours;
  }

  /**
   * Log a post to the database (whether we comment or skip)
   * Uses upsert to avoid duplicate key errors
   */
  async logPost(post, filterResult, commentText = null, options = {}) {
    const dryRun = options.dryRun === true;
    let commented = filterResult.pass && !!commentText;
    let skipped = !filterResult.pass;
    let skipReason = filterResult.pass ? null : filterResult.reason;
    if (dryRun && filterResult.pass && commentText) {
      commented = false;
      skipped = true;
      skipReason = 'dry_run';
    }
    const record = {
      post_id: post.postId,
      author_name: post.authorName,
      author_linkedin: post.authorUrl,
      target_id: filterResult.targetId || null,
      post_text: post.text ? post.text.substring(0, 2000) : null,
      post_type: post.type || 'unknown',
      seen_at: new Date().toISOString(),
      commented,
      comment_text: commentText,
      commented_at: commented ? new Date().toISOString() : null,
      skipped,
      skip_reason: skipReason,
      skip_detail: filterResult.detail || null,
    };

    // Use upsert to handle duplicates - update if post_id already exists
    const { error } = await this.supabase
      .from('posts_seen')
      .upsert(record, { 
        onConflict: 'post_id',
        ignoreDuplicates: true 
      });

    if (error) {
      console.error('Failed to log post:', error);
    }
  }
}

module.exports = PostFilter;
