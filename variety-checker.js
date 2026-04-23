/**
 * Comment Variety Checker
 * 
 * Ensures generated comments don't fall into detectable patterns.
 * Tracks recent comments and rejects repetitive ones.
 */

class VarietyChecker {
  constructor(config = {}) {
    this.recentComments = [];
    this.config = {
      historySize: config.historySize || 20,
      maxConsecutiveSameStart: 1,
      maxQuestionsInLast10: 2,
      minWordCount: 8,
      maxWordCount: 55,
      ...config,
    };
  }

  /**
   * Check if a comment passes variety rules
   * Returns { pass: bool, violations: string[] }
   */
  check(comment) {
    const violations = [];
    const words = comment.trim().split(/\s+/);
    const firstWord = words[0]?.toLowerCase();
    const endsWithQuestion = comment.trim().endsWith('?');

    // Word count check
    if (words.length < this.config.minWordCount) {
      violations.push(`too_short: ${words.length} words (min ${this.config.minWordCount})`);
    }
    if (words.length > this.config.maxWordCount) {
      violations.push(`too_long: ${words.length} words (max ${this.config.maxWordCount})`);
    }

    // Consecutive same starting word
    if (this.recentComments.length > 0) {
      const lastStart = this._getFirstWord(this.recentComments[this.recentComments.length - 1]);
      if (firstWord === lastStart) {
        violations.push(`same_start: "${firstWord}" (same as previous comment)`);
      }
    }

    // Too many questions recently
    if (endsWithQuestion) {
      const recent10 = this.recentComments.slice(-10);
      const questionCount = recent10.filter(c => c.trim().endsWith('?')).length;
      if (questionCount >= this.config.maxQuestionsInLast10) {
        violations.push(`too_many_questions: ${questionCount} in last 10`);
      }
    }

    // Check for repeated phrases (3+ word sequences)
    const repeated = this._checkRepeatedPhrases(comment);
    if (repeated) {
      violations.push(`repeated_phrase: "${repeated}"`);
    }

    // Check for cliché openers
    const cliches = [
      'great point', 'love this', 'so true', 'well said',
      'couldn\'t agree more', 'this is great', 'amazing',
      'absolutely', 'totally agree', 'this resonates',
    ];
    const commentLower = comment.toLowerCase();
    for (const cliche of cliches) {
      if (commentLower.startsWith(cliche)) {
        violations.push(`cliche_opener: "${cliche}"`);
        break;
      }
    }

    return {
      pass: violations.length === 0,
      violations,
    };
  }

  /**
   * Record a comment that was posted
   */
  record(comment) {
    this.recentComments.push(comment);
    if (this.recentComments.length > this.config.historySize) {
      this.recentComments.shift();
    }
  }

  /**
   * Get instructions for regeneration based on violations
   */
  getRegenerationHint(violations) {
    const hints = violations.map(v => {
      if (v.startsWith('same_start')) return 'Start with a different word than the previous comment.';
      if (v.startsWith('too_many_questions')) return 'Make a statement instead of asking a question.';
      if (v.startsWith('repeated_phrase')) return 'Avoid reusing phrases from recent comments.';
      if (v.startsWith('cliche_opener')) return 'Avoid generic openers like "Great point" or "Love this". Start with substance.';
      if (v.startsWith('too_short')) return 'Make the comment slightly longer (2-3 sentences).';
      if (v.startsWith('too_long')) return 'Keep the comment shorter (1-2 sentences max).';
      return '';
    }).filter(Boolean);

    return hints.join(' ');
  }

  _getFirstWord(comment) {
    return comment.trim().split(/\s+/)[0]?.toLowerCase();
  }

  _checkRepeatedPhrases(comment) {
    const words = comment.toLowerCase().split(/\s+/);
    if (words.length < 3) return null;

    // Generate 3-word phrases from new comment
    const newPhrases = new Set();
    for (let i = 0; i <= words.length - 3; i++) {
      newPhrases.add(words.slice(i, i + 3).join(' '));
    }

    // Check against recent comments
    for (const recent of this.recentComments) {
      const recentWords = recent.toLowerCase().split(/\s+/);
      for (let i = 0; i <= recentWords.length - 3; i++) {
        const phrase = recentWords.slice(i, i + 3).join(' ');
        if (newPhrases.has(phrase)) {
          return phrase;
        }
      }
    }

    return null;
  }
}

module.exports = VarietyChecker;
