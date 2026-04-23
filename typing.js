/**
 * Typing Humanization Module
 * 
 * Character-by-character typing with variable delays,
 * planned typos, and backspace correction.
 */

// Common bigrams that humans type faster
const FAST_BIGRAMS = new Set([
  'th', 'he', 'in', 'er', 'an', 'on', 'en', 're', 'ed', 'nd',
  'ou', 'to', 'ha', 'st', 'ng', 'at', 'es', 'is', 'or', 'it',
  'al', 'ar', 'te', 'se', 'le', 'of', 'nt', 'ti', 'ne', 'de'
]);

// Adjacent keys for realistic typos
const ADJACENT_KEYS = {
  'a': ['s', 'q', 'w', 'z'],
  'b': ['v', 'n', 'g', 'h'],
  'c': ['x', 'v', 'd', 'f'],
  'd': ['s', 'f', 'e', 'r', 'c', 'x'],
  'e': ['w', 'r', 'd', 's'],
  'f': ['d', 'g', 'r', 't', 'v', 'c'],
  'g': ['f', 'h', 't', 'y', 'b', 'v'],
  'h': ['g', 'j', 'y', 'u', 'n', 'b'],
  'i': ['u', 'o', 'k', 'j'],
  'j': ['h', 'k', 'u', 'i', 'n', 'm'],
  'k': ['j', 'l', 'i', 'o', 'm'],
  'l': ['k', 'o', 'p'],
  'm': ['n', 'j', 'k'],
  'n': ['b', 'm', 'h', 'j'],
  'o': ['i', 'p', 'l', 'k'],
  'p': ['o', 'l'],
  'q': ['w', 'a'],
  'r': ['e', 't', 'd', 'f'],
  's': ['a', 'd', 'w', 'e', 'z', 'x'],
  't': ['r', 'y', 'f', 'g'],
  'u': ['y', 'i', 'h', 'j'],
  'v': ['c', 'b', 'f', 'g'],
  'w': ['q', 'e', 'a', 's'],
  'x': ['z', 'c', 's', 'd'],
  'y': ['t', 'u', 'g', 'h'],
  'z': ['a', 'x', 's'],
};

class HumanTyper {
  constructor(page, config = {}) {
    this.page = page;
    this.config = {
      baseDelayMin: config.baseDelayMin || 50,
      baseDelayMax: config.baseDelayMax || 120,
      typoFrequency: config.typoFrequency || 0.28,
      wordBoundaryExtraDelay: config.wordBoundaryExtraDelay || 80,
      punctuationExtraDelay: config.punctuationExtraDelay || 150,
      ...config,
    };
  }

  _randomDelay(min, max) {
    // Use a slightly weighted distribution (more likely to be mid-range)
    const r = (Math.random() + Math.random()) / 2;
    return min + r * (max - min);
  }

  _getCharDelay(char, prevChar) {
    let delay = this._randomDelay(this.config.baseDelayMin, this.config.baseDelayMax);

    // Faster for common bigrams
    if (prevChar && FAST_BIGRAMS.has((prevChar + char).toLowerCase())) {
      delay *= 0.65;
    }

    // Slower at word boundaries
    if (char === ' ') {
      delay += this._randomDelay(0, this.config.wordBoundaryExtraDelay);
    }

    // Slower after punctuation
    if (prevChar && '.!?,;:'.includes(prevChar)) {
      delay += this._randomDelay(50, this.config.punctuationExtraDelay);
    }

    // Occasional burst typing (3-5 chars fast)
    if (Math.random() < 0.08) {
      delay *= 0.4;
    }

    // Occasional pause (thinking)
    if (Math.random() < 0.03) {
      delay += this._randomDelay(200, 600);
    }

    return Math.max(20, delay);
  }

  _getTypoChar(originalChar) {
    const lower = originalChar.toLowerCase();
    const adjacents = ADJACENT_KEYS[lower];
    if (!adjacents || adjacents.length === 0) return null;

    const typoChar = adjacents[Math.floor(Math.random() * adjacents.length)];
    // Preserve case
    return originalChar === originalChar.toUpperCase()
      ? typoChar.toUpperCase()
      : typoChar;
  }

  /**
   * Plan a typo for this text.
   * Returns { position, typoChar } or null
   */
  _planTypo(text) {
    if (Math.random() > this.config.typoFrequency) return null;
    if (text.length < 10) return null;

    // Pick a position in the middle portion (not first or last few chars)
    const start = Math.floor(text.length * 0.2);
    const end = Math.floor(text.length * 0.8);
    const position = start + Math.floor(Math.random() * (end - start));

    const char = text[position];
    if (char === ' ' || '.!?,;:'.includes(char)) return null;

    const typoChar = this._getTypoChar(char);
    if (!typoChar) return null;

    return { position, typoChar };
  }

  /**
   * Type text into a focused element with human-like behavior
   */
  async typeText(text, selector) {
    if (selector) {
      await this.page.click(selector);
      await this._sleep(this._randomDelay(200, 500));
    }

    const typo = this._planTypo(text);
    let prevChar = null;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle planned typo
      if (typo && i === typo.position) {
        // Type the wrong character
        await this.page.keyboard.type(typo.typoChar, { delay: 0 });
        await this._sleep(this._getCharDelay(typo.typoChar, prevChar));

        // Maybe type 1-2 more correct characters before noticing
        const extraChars = Math.random() < 0.4 ? Math.floor(Math.random() * 2) + 1 : 0;
        for (let j = 0; j < extraChars && i + 1 + j < text.length; j++) {
          await this.page.keyboard.type(text[i + 1 + j], { delay: 0 });
          await this._sleep(this._getCharDelay(text[i + 1 + j], text[i + j]));
        }

        // Pause — noticing the error
        await this._sleep(this._randomDelay(200, 500));

        // Backspace to fix — sometimes overshoot by 1
        const backspaces = 1 + extraChars;
        const overshootBackspace = Math.random() < 0.25 ? 1 : 0;
        const totalBackspaces = backspaces + overshootBackspace;

        for (let b = 0; b < totalBackspaces; b++) {
          await this.page.keyboard.press('Backspace');
          await this._sleep(this._randomDelay(40, 90));
        }

        // If we overshot, retype the extra deleted char
        if (overshootBackspace) {
          const reChar = text[i - 1];
          if (reChar) {
            await this._sleep(this._randomDelay(60, 150));
            await this.page.keyboard.type(reChar, { delay: 0 });
            await this._sleep(this._randomDelay(40, 80));
          }
        }

        // Now type the correct character
        await this.page.keyboard.type(char, { delay: 0 });
        await this._sleep(this._getCharDelay(char, prevChar));

        // Skip the extra chars we already typed (they were deleted)
        // We re-type them in the normal loop
        prevChar = char;
        continue;
      }

      // Normal typing
      await this.page.keyboard.type(char, { delay: 0 });
      const delay = this._getCharDelay(char, prevChar);
      await this._sleep(delay);
      prevChar = char;
    }
  }

  /**
   * Simulate copy-paste (Ctrl+A, Ctrl+C, click target, Ctrl+V)
   */
  async copyPaste(text, targetSelector) {
    // Set clipboard via page evaluate
    await this.page.evaluate((t) => navigator.clipboard.writeText(t), text);

    // Click target
    await this.page.click(targetSelector);
    await this._sleep(this._randomDelay(100, 300));

    // Ctrl+V
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.down(modifier);
    await this._sleep(this._randomDelay(30, 80));
    await this.page.keyboard.press('v');
    await this._sleep(this._randomDelay(30, 60));
    await this.page.keyboard.up(modifier);

    await this._sleep(this._randomDelay(100, 300));
  }

  /**
   * Clear a field like a human (Ctrl+A then Delete)
   */
  async clearField(selector) {
    await this.page.click(selector);
    await this._sleep(this._randomDelay(100, 200));

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.down(modifier);
    await this.page.keyboard.press('a');
    await this.page.keyboard.up(modifier);
    await this._sleep(this._randomDelay(50, 150));
    await this.page.keyboard.press('Delete');
    await this._sleep(this._randomDelay(100, 200));
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HumanTyper;
