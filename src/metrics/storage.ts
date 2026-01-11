/**
 * Metrics file storage utilities.
 * Handles reading, writing, and size enforcement for metrics and issues data.
 */

import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, stat } from "fs/promises";
import { existsSync } from "fs";
import {
  MetricsData,
  createEmptyMetricsData,
  IssuesData,
  createEmptyIssuesData,
} from "./types.js";

/** Directory name for metrics files in user's home directory */
const METRICS_DIR_NAME = ".mcp-metrics";

/**
 * Gets the full path to the metrics file for a given server.
 * @param serverName - The server name from config
 * @returns Full path like ~/.mcp-metrics/my-mcp-server.json
 */
export function getMetricsFilePath(serverName: string): string {
  return join(homedir(), METRICS_DIR_NAME, `${serverName}.json`);
}

/**
 * Gets the metrics directory path.
 */
export function getMetricsDir(): string {
  return join(homedir(), METRICS_DIR_NAME);
}

/**
 * Ensures the metrics directory exists.
 * Creates it if it doesn't exist.
 */
export async function ensureMetricsDir(): Promise<void> {
  const dir = getMetricsDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Loads metrics data from disk.
 * Returns empty metrics if file doesn't exist or is corrupted.
 *
 * @param serverName - The server name from config
 * @returns The loaded or newly created metrics data
 */
export async function loadMetrics(serverName: string): Promise<MetricsData> {
  const filePath = getMetricsFilePath(serverName);

  try {
    if (!existsSync(filePath)) {
      return createEmptyMetricsData(serverName);
    }

    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as MetricsData;

    // Basic validation
    if (
      typeof data.server_name !== "string" ||
      !Array.isArray(data.invocations)
    ) {
      console.error("Metrics file corrupted, creating new one");
      return createEmptyMetricsData(serverName);
    }

    return data;
  } catch (error) {
    console.error("Failed to load metrics:", error);
    return createEmptyMetricsData(serverName);
  }
}

/**
 * Saves metrics data to disk.
 * Ensures the metrics directory exists before writing.
 *
 * @param data - The metrics data to save
 */
export async function saveMetrics(data: MetricsData): Promise<void> {
  await ensureMetricsDir();
  const filePath = getMetricsFilePath(data.server_name);
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Gets the current size of the metrics file in bytes.
 * Returns 0 if the file doesn't exist.
 *
 * @param serverName - The server name from config
 * @returns File size in bytes
 */
export async function getMetricsFileSize(serverName: string): Promise<number> {
  const filePath = getMetricsFilePath(serverName);

  try {
    if (!existsSync(filePath)) {
      return 0;
    }
    const stats = await stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Trims old invocations from metrics data to stay under the size limit.
 * Removes the oldest 25% of invocations when called.
 * Aggregated tool_stats are preserved (never trimmed).
 *
 * @param data - The metrics data to trim (modified in place)
 * @param maxSizeBytes - Maximum file size in bytes
 * @returns The trimmed metrics data
 */
export function trimInvocationsForSize(
  data: MetricsData,
  maxSizeBytes: number
): MetricsData {
  // Estimate current size
  let currentSize = JSON.stringify(data).length;

  while (currentSize > maxSizeBytes && data.invocations.length > 0) {
    // Remove oldest 25% of invocations (minimum 1)
    const removeCount = Math.max(1, Math.floor(data.invocations.length * 0.25));
    data.invocations = data.invocations.slice(removeCount);

    // Re-estimate size
    currentSize = JSON.stringify(data).length;
  }

  return data;
}

/**
 * Initializes the metrics file on disk.
 * Creates an empty metrics file if it doesn't exist.
 *
 * @param serverName - The server name from config
 */
export async function initializeMetricsFile(serverName: string): Promise<void> {
  await ensureMetricsDir();
  const filePath = getMetricsFilePath(serverName);

  if (!existsSync(filePath)) {
    const emptyData = createEmptyMetricsData(serverName);
    await saveMetrics(emptyData);
  }
}

// =============================================================================
// Issues Storage
// =============================================================================

/**
 * Gets the full path to the issues file for a given server.
 * @param serverName - The server name from config
 * @returns Full path like ~/.mcp-metrics/my-mcp-server.issues.json
 */
export function getIssuesFilePath(serverName: string): string {
  return join(homedir(), METRICS_DIR_NAME, `${serverName}.issues.json`);
}

/**
 * Loads issues data from disk.
 * Returns empty issues if file doesn't exist or is corrupted.
 *
 * @param serverName - The server name from config
 * @returns The loaded or newly created issues data
 */
export async function loadIssues(serverName: string): Promise<IssuesData> {
  const filePath = getIssuesFilePath(serverName);

  try {
    if (!existsSync(filePath)) {
      return createEmptyIssuesData(serverName);
    }

    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as IssuesData;

    // Basic validation
    if (
      typeof data.server_name !== "string" ||
      !Array.isArray(data.issues)
    ) {
      console.error("Issues file corrupted, creating new one");
      return createEmptyIssuesData(serverName);
    }

    return data;
  } catch (error) {
    console.error("Failed to load issues:", error);
    return createEmptyIssuesData(serverName);
  }
}

/**
 * Saves issues data to disk.
 * Ensures the metrics directory exists before writing.
 *
 * @param data - The issues data to save
 */
export async function saveIssues(data: IssuesData): Promise<void> {
  await ensureMetricsDir();
  const filePath = getIssuesFilePath(data.server_name);
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Initializes the issues file on disk.
 * Creates an empty issues file if it doesn't exist.
 *
 * @param serverName - The server name from config
 */
export async function initializeIssuesFile(serverName: string): Promise<void> {
  await ensureMetricsDir();
  const filePath = getIssuesFilePath(serverName);

  if (!existsSync(filePath)) {
    const emptyData = createEmptyIssuesData(serverName);
    await saveIssues(emptyData);
  }
}
