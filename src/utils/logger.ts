/**
 * Logging utility for MCP servers.
 *
 * IMPORTANT: MCP servers use stdio for communication, so we MUST use stderr
 * for all logging. Using console.log() or stdout will break the MCP protocol.
 *
 * This logger provides a simple, leveled logging interface that safely writes
 * to stderr and can be configured via environment variables.
 */

/**
 * Available log levels in order of verbosity.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Get the current log level from environment or default to "info".
 * Set LOG_LEVEL=debug for verbose output, LOG_LEVEL=error for minimal output.
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return "info";
}

/**
 * Format a log message with timestamp and level.
 */
function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  
  let formatted = `[${timestamp}] ${levelStr} ${message}`;
  
  if (data !== undefined) {
    if (data instanceof Error) {
      formatted += `\n  Error: ${data.message}`;
      if (data.stack) {
        formatted += `\n  Stack: ${data.stack}`;
      }
    } else if (typeof data === "object") {
      formatted += `\n  ${JSON.stringify(data, null, 2).replace(/\n/g, "\n  ")}`;
    } else {
      formatted += ` ${data}`;
    }
  }
  
  return formatted;
}

/**
 * Check if a message at the given level should be logged.
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Logger object with methods for each log level.
 *
 * All output goes to stderr to avoid interfering with MCP protocol on stdout.
 *
 * @example
 * ```typescript
 * import { logger } from "./utils/logger.js";
 *
 * logger.info("Server started");
 * logger.debug("Processing request", { toolName: "echo" });
 * logger.error("Failed to connect", new Error("Connection refused"));
 * ```
 */
export const logger = {
  /**
   * Debug-level logging for detailed troubleshooting.
   * Only shown when LOG_LEVEL=debug.
   */
  debug(message: string, data?: unknown): void {
    if (shouldLog("debug")) {
      console.error(formatMessage("debug", message, data));
    }
  },

  /**
   * Info-level logging for general operational messages.
   * Shown by default (LOG_LEVEL=info or lower).
   */
  info(message: string, data?: unknown): void {
    if (shouldLog("info")) {
      console.error(formatMessage("info", message, data));
    }
  },

  /**
   * Warning-level logging for potentially problematic situations.
   */
  warn(message: string, data?: unknown): void {
    if (shouldLog("warn")) {
      console.error(formatMessage("warn", message, data));
    }
  },

  /**
   * Error-level logging for failures and exceptions.
   */
  error(message: string, data?: unknown): void {
    if (shouldLog("error")) {
      console.error(formatMessage("error", message, data));
    }
  },
};

/**
 * Create a child logger with a prefix for categorizing log output.
 *
 * @example
 * ```typescript
 * const toolLogger = createLogger("tools");
 * toolLogger.info("Tool invoked", { name: "echo" });
 * // Output: [2026-01-01T12:00:00.000Z] INFO  [tools] Tool invoked
 * ```
 */
export function createLogger(prefix: string) {
  return {
    debug(message: string, data?: unknown): void {
      logger.debug(`[${prefix}] ${message}`, data);
    },
    info(message: string, data?: unknown): void {
      logger.info(`[${prefix}] ${message}`, data);
    },
    warn(message: string, data?: unknown): void {
      logger.warn(`[${prefix}] ${message}`, data);
    },
    error(message: string, data?: unknown): void {
      logger.error(`[${prefix}] ${message}`, data);
    },
  };
}
