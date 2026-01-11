/**
 * Environment variable utilities for MCP servers.
 *
 * Provides type-safe access to environment variables with validation,
 * default values, and clear error messages when required vars are missing.
 */

import { logger } from "./logger.js";

/**
 * Error thrown when a required environment variable is missing.
 */
export class EnvError extends Error {
  constructor(
    public readonly varName: string,
    message: string
  ) {
    super(message);
    this.name = "EnvError";
  }
}

/**
 * Gets a required string environment variable.
 * Throws EnvError if the variable is not set or is empty.
 *
 * @example
 * ```typescript
 * const apiKey = getRequiredEnv("OPENAI_API_KEY");
 * ```
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new EnvError(
      name,
      `Required environment variable ${name} is not set. ` +
        `Please set it before running the server.`
    );
  }
  return value;
}

/**
 * Gets an optional string environment variable with a default value.
 *
 * @example
 * ```typescript
 * const timeout = getEnv("API_TIMEOUT", "30000");
 * const region = getEnv("AWS_REGION", "us-east-1");
 * ```
 */
export function getEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return defaultValue;
  }
  return value;
}

/**
 * Gets an optional environment variable, returning undefined if not set.
 *
 * @example
 * ```typescript
 * const debugMode = getOptionalEnv("DEBUG");
 * if (debugMode) {
 *   // Enable debug features
 * }
 * ```
 */
export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return undefined;
  }
  return value;
}

/**
 * Gets an environment variable as a number.
 * Returns the default value if not set or if parsing fails.
 *
 * @example
 * ```typescript
 * const port = getEnvAsNumber("PORT", 3000);
 * const maxRetries = getEnvAsNumber("MAX_RETRIES", 3);
 * ```
 */
export function getEnvAsNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    logger.warn(`Environment variable ${name} is not a valid number, using default`, {
      value,
      default: defaultValue,
    });
    return defaultValue;
  }
  return parsed;
}

/**
 * Gets an environment variable as a boolean.
 * Recognizes: "true", "1", "yes" as true; "false", "0", "no" as false.
 * Returns the default value if not set or not recognized.
 *
 * @example
 * ```typescript
 * const verbose = getEnvAsBoolean("VERBOSE", false);
 * const dryRun = getEnvAsBoolean("DRY_RUN", false);
 * ```
 */
export function getEnvAsBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.toLowerCase();
  if (!value) {
    return defaultValue;
  }
  if (["true", "1", "yes"].includes(value)) {
    return true;
  }
  if (["false", "0", "no"].includes(value)) {
    return false;
  }
  logger.warn(`Environment variable ${name} is not a valid boolean, using default`, {
    value,
    default: defaultValue,
  });
  return defaultValue;
}

/**
 * Validates that all required environment variables are set.
 * Call this at startup to fail fast if configuration is incomplete.
 *
 * @example
 * ```typescript
 * // At server startup:
 * validateRequiredEnvVars([
 *   "OPENAI_API_KEY",
 *   "DATABASE_URL",
 * ]);
 * ```
 *
 * @throws EnvError if any required variable is missing
 */
export function validateRequiredEnvVars(names: string[]): void {
  const missing: string[] = [];
  
  for (const name of names) {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      missing.push(name);
    }
  }
  
  if (missing.length > 0) {
    throw new EnvError(
      missing[0],
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Please set these before running the server.`
    );
  }
}

/**
 * Loads environment configuration for the MCP server.
 * Returns an object with all environment-based settings.
 *
 * Extend this function to add your own environment variables.
 *
 * @example
 * ```typescript
 * const env = loadEnvConfig();
 * console.error(`Log level: ${env.logLevel}`);
 * ```
 */
export function loadEnvConfig() {
  return {
    /** Log level: debug, info, warn, error, silent */
    logLevel: getEnv("LOG_LEVEL", "info"),
    
    /** Whether metrics collection is enabled */
    metricsEnabled: getEnvAsBoolean("MCP_METRICS_ENABLED", true),
    
    /** Node environment: development, production, test */
    nodeEnv: getEnv("NODE_ENV", "development"),
    
    // Add your own environment variables here:
    // apiKey: getRequiredEnv("MY_API_KEY"),
    // apiBaseUrl: getEnv("API_BASE_URL", "https://api.example.com"),
  };
}
