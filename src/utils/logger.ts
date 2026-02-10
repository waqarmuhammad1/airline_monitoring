const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function timestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, context: string, message: string): string {
  return `[${timestamp()}] [${level.toUpperCase()}] [${context}] ${message}`;
}

export const logger = {
  debug(context: string, message: string) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", context, message));
  },
  info(context: string, message: string) {
    if (shouldLog("info")) console.info(formatMessage("info", context, message));
  },
  warn(context: string, message: string) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", context, message));
  },
  error(context: string, message: string, err?: unknown) {
    if (shouldLog("error")) {
      console.error(formatMessage("error", context, message));
      if (err instanceof Error) console.error(err.stack);
    }
  },
};
