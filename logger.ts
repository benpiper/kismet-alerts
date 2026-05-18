const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL?.toUpperCase() as LogLevel) ?? 'INFO'];

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

function format(level: LogLevel, message: string, context: Record<string, unknown>): string {
  const timestamp = formatTimestamp();
  let output = `[${timestamp}] ${level}: ${message}`;
  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`;
  }
  return output;
}

export const logger = {
  debug: (message: string, context: Record<string, unknown> = {}) => {
    if (shouldLog('DEBUG')) {
      console.log(format('DEBUG', message, context));
    }
  },

  info: (message: string, context: Record<string, unknown> = {}) => {
    if (shouldLog('INFO')) {
      console.log(format('INFO', message, context));
    }
  },

  warn: (message: string, context: Record<string, unknown> = {}) => {
    if (shouldLog('WARN')) {
      console.warn(format('WARN', message, context));
    }
  },

  error: (message: string, context: Record<string, unknown> = {}) => {
    if (shouldLog('ERROR')) {
      console.error(format('ERROR', message, context));
    }
  },
};
