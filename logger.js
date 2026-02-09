/**
 * Simple structured logging utility with ISO timestamps and log levels.
 * No external dependencies - uses only Node.js built-ins.
 *
 * Usage: logger.info('Message', {context: 'data'})
 * Log level controlled via LOG_LEVEL env var (DEBUG, INFO, WARN, ERROR)
 * Defaults to INFO
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function formatTimestamp() {
  return new Date().toISOString();
}

function shouldLog(level) {
  return LOG_LEVELS[level] >= currentLevel;
}

function format(level, message, context) {
  const timestamp = formatTimestamp();
  let output = `[${timestamp}] ${level}: ${message}`;
  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`;
  }
  return output;
}

export const logger = {
  debug: (message, context = {}) => {
    if (shouldLog('DEBUG')) {
      console.log(format('DEBUG', message, context));
    }
  },

  info: (message, context = {}) => {
    if (shouldLog('INFO')) {
      console.log(format('INFO', message, context));
    }
  },

  warn: (message, context = {}) => {
    if (shouldLog('WARN')) {
      console.warn(format('WARN', message, context));
    }
  },

  error: (message, context = {}) => {
    if (shouldLog('ERROR')) {
      console.error(format('ERROR', message, context));
    }
  },
};
