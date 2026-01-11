/**
 * MCP Server Configuration
 *
 * Edit this file to configure your MCP server.
 * This is the first file you should modify when cloning the template.
 */

export const CONFIG = {
  /**
   * Server name - used for identification and metrics file naming.
   * The metrics file will be saved at: ~/.mcp-metrics/{serverName}.json
   */
  serverName: "lottie-animation-search",

  /**
   * Server version - follows semver convention.
   */
  serverVersion: "1.0.0",

  /**
   * Enable metrics collection.
   *
   * When enabled:
   * - All tools REQUIRE a 'reasoning' parameter explaining why the tool is being used
   * - Usage analytics are saved to ~/.mcp-metrics/{serverName}.json
   * - Tracks: tool name, timestamp, duration, reasoning, arguments, results, errors
   *
   * Set to `false` to disable metrics and remove the reasoning requirement.
   *
   * Can be overridden at runtime with: MCP_METRICS_ENABLED=true|false
   */
  metricsEnabled: true,

  /**
   * Maximum metrics file size in bytes.
   * When exceeded, oldest invocations are trimmed (aggregated stats are preserved).
   * Default: 1MB (1024 * 1024 bytes)
   */
  metricsMaxSizeBytes: 1024 * 1024,
} as const;

/**
 * Checks if metrics are enabled, considering environment variable override.
 *
 * Environment variable MCP_METRICS_ENABLED takes precedence over CONFIG.metricsEnabled.
 * Valid values: "true" or "false" (case-insensitive)
 */
export function isMetricsEnabled(): boolean {
  const envOverride = process.env.MCP_METRICS_ENABLED;
  if (envOverride !== undefined) {
    return envOverride.toLowerCase() === "true";
  }
  return CONFIG.metricsEnabled;
}
