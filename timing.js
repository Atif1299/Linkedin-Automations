/**
 * Timing & Scheduling Module
 * 
 * Manages operating hours, lunch breaks, session patterns,
 * and daily variance for human-like activity patterns.
 */

class TimingEngine {
  constructor(config = {}) {
    this.config = {
      operatingHours: { start: 9, end: 18 },
      lunchBreak: { earliest: 11.5, latest: 13, duration: 60 },
      session: {
        minComments: 7,
        maxComments: 10,
        breakMinMinutes: 15,
        breakMaxMinutes: 25,
      },
      daily: {
        startVarianceMinutes: 15,
        activityTaper: true,
      },
      timezone: config.timezone || 'America/New_York',
      /** [minMs, maxMs] per getActionDelay(type); override in schmoozzer.json timing.actionDelaysMs */
      actionDelaysMs: {
        before_typing: [2000, 5000],
        after_typing: [500, 2000],
        after_submit: [1000, 3000],
        between_posts: [1000, 4000],
        default: [500, 1500],
      },
      /** Pause after feed navigation before first scroll */
      postFeedSettleMs: [2000, 4000],
      /** Dev override: if true, ignore operating window and run immediately */
      alwaysOn: false,
      ...config,
    };

    // Daily plan — regenerated each morning
    this.dailyPlan = null;
    this.currentSession = null;
  }

  /**
   * Generate a plan for today
   * Called once at the start of each day
   */
  generateDailyPlan() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Randomize start time (±variance from configured start)
    const startVariance = (Math.random() - 0.5) * 2 * this.config.daily.startVarianceMinutes;
    const startHour = this.config.operatingHours.start + startVariance / 60;

    // Randomize lunch start within window
    const lunchStart = this._randomBetween(
      this.config.lunchBreak.earliest,
      this.config.lunchBreak.latest
    );
    const lunchDuration = this.config.lunchBreak.duration + this._randomBetween(-10, 10);
    const lunchEnd = lunchStart + lunchDuration / 60;

    // Randomize end time slightly
    const endVariance = (Math.random() - 0.5) * 20; // ±10 minutes
    const endHour = this.config.operatingHours.end + endVariance / 60;

    this.dailyPlan = {
      date: today,
      startHour,
      endHour,
      lunchStart,
      lunchEnd,
      lunchDuration,
      sessionsCompleted: 0,
      totalComments: 0,
    };

    return this.dailyPlan;
  }

  /**
   * Check if we should be operating right now
   */
  isOperatingTime() {
    if (!this.dailyPlan) this.generateDailyPlan();
    if (this.config.alwaysOn) {
      return { active: true, taperFactor: 1, reason: 'always_on' };
    }

    const now = new Date();
    const day = now.getDay();

    // No weekends
    if (day === 0 || day === 6) return { active: false, reason: 'weekend' };

    const currentHour = now.getHours() + now.getMinutes() / 60;

    // Before start
    if (currentHour < this.dailyPlan.startHour) {
      return {
        active: false,
        reason: 'before_hours',
        resumeIn: (this.dailyPlan.startHour - currentHour) * 60,
      };
    }

    // After end
    if (currentHour >= this.dailyPlan.endHour) {
      return { active: false, reason: 'after_hours' };
    }

    // Lunch break
    if (currentHour >= this.dailyPlan.lunchStart && currentHour < this.dailyPlan.lunchEnd) {
      return {
        active: false,
        reason: 'lunch_break',
        resumeIn: (this.dailyPlan.lunchEnd - currentHour) * 60,
      };
    }

    // Activity taper in last hour
    const hoursLeft = this.dailyPlan.endHour - currentHour;
    const taperFactor = this.config.daily.activityTaper && hoursLeft < 1
      ? hoursLeft
      : 1;

    return { active: true, taperFactor };
  }

  /**
   * Start a new session — returns session config
   */
  startSession() {
    const commentTarget = Math.floor(this._randomBetween(
      this.config.session.minComments,
      this.config.session.maxComments + 1
    ));

    // Apply taper — fewer comments in last hour
    const opStatus = this.isOperatingTime();
    const adjustedTarget = Math.max(3, Math.floor(commentTarget * (opStatus.taperFactor || 1)));

    this.currentSession = {
      id: `session_${Date.now()}`,
      startedAt: new Date(),
      commentTarget: adjustedTarget,
      commentsCompleted: 0,
      postsScanned: 0,
      postsSkipped: 0,
    };

    return this.currentSession;
  }

  /**
   * Record a comment in the current session
   * Returns { continue: bool, breakNeeded: bool }
   */
  recordComment() {
    if (!this.currentSession) return { continue: false, breakNeeded: true };

    this.currentSession.commentsCompleted++;
    this.dailyPlan.totalComments++;

    if (this.currentSession.commentsCompleted >= this.currentSession.commentTarget) {
      return { continue: false, breakNeeded: true };
    }

    return { continue: true, breakNeeded: false };
  }

  /**
   * Get break duration for current session end
   */
  getBreakDuration() {
    const minutes = this._randomBetween(
      this.config.session.breakMinMinutes,
      this.config.session.breakMaxMinutes
    );
    return Math.floor(minutes * 60 * 1000); // return milliseconds
  }

  /**
   * Get delay between actions within a session
   * (reading a post, before typing, after typing, etc.)
   */
  getActionDelay(type) {
    const table = this.config.actionDelaysMs || {};
    const pick = (key, fallback) => {
      const pair = table[key] || fallback;
      return this._randomBetween(pair[0], pair[1]);
    };
    switch (type) {
      case 'before_typing':
        return pick('before_typing', [2000, 5000]);
      case 'after_typing':
        return pick('after_typing', [500, 2000]);
      case 'after_submit':
        return pick('after_submit', [1000, 3000]);
      case 'between_posts':
        return pick('between_posts', [1000, 4000]);
      default:
        return pick('default', [500, 1500]);
    }
  }

  /** Random delay after opening /feed before scrolling */
  getPostFeedSettleMs() {
    const pair = this.config.postFeedSettleMs || [2000, 4000];
    return this._randomBetween(pair[0], pair[1]);
  }

  /**
   * Get milliseconds until next operating window
   */
  getTimeUntilNextWindow() {
    const status = this.isOperatingTime();
    if (status.active) return 0;

    if (status.resumeIn) {
      return status.resumeIn * 60 * 1000; // minutes to ms
    }

    // If after hours or weekend, calculate until next weekday morning
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(Math.floor(this.config.operatingHours.start), 0, 0, 0);

    // Skip to Monday if weekend
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }

    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Check if today is a new day and regenerate plan if needed
   */
  checkNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (!this.dailyPlan || this.dailyPlan.date !== today) {
      this.generateDailyPlan();
      return true;
    }
    return false;
  }

  _randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }
}

module.exports = TimingEngine;
