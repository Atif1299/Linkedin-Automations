/**
 * Structured Logger
 * 
 * Consistent logging with levels, timestamps, and optional file output.
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.logDir = options.logDir || './logs';
    this.writeToFile = options.writeToFile !== false;

    if (this.writeToFile) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
  }

  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  _format(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  _write(level, message, data) {
    if (!this._shouldLog(level)) return;

    const formatted = this._format(level, message, data);
    console.log(formatted);

    if (this.writeToFile) {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `${today}.log`);
      fs.appendFileSync(logFile, formatted + '\n');
    }
  }

  debug(message, data) { this._write('debug', message, data); }
  info(message, data) { this._write('info', message, data); }
  warn(message, data) { this._write('warn', message, data); }
  error(message, data) {
    if (data instanceof Error) {
      this._write('error', message, { message: data.message, stack: data.stack });
    } else {
      this._write('error', message, data);
    }
  }
}

// Singleton instance
module.exports = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || './logs',
});
