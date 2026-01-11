/**
 * MetricsCollector - Core class for collecting and persisting tool usage metrics.
 *
 * Features:
 * - Async write queue to avoid blocking tool execution
 * - Automatic size enforcement (trims oldest invocations)
 * - Aggregated per-tool statistics
 * - Fail-silent with logging on errors
 */

import {
  MetricsData,
  ToolInvocation,
  ToolStats,
  createEmptyMetricsData,
} from "./types.js";
import {
  loadMetrics,
  saveMetrics,
  trimInvocationsForSize,
  initializeMetricsFile,
  getMetricsFilePath,
} from "./storage.js";

export class MetricsCollector {
  private data: MetricsData;
  private serverName: string;
  private maxSizeBytes: number;
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized: boolean = false;

  constructor(serverName: string, maxSizeBytes: number) {
    this.serverName = serverName;
    this.maxSizeBytes = maxSizeBytes;
    // Start with empty data, will be populated on init
    this.data = createEmptyMetricsData(serverName);
  }

  /**
   * Initializes the collector by loading existing metrics or creating a new file.
   * Should be called once at server startup.
   */
  async initialize(): Promise<void> {
    try {
      await initializeMetricsFile(this.serverName);
      this.data = await loadMetrics(this.serverName);
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize metrics:", error);
      // Continue with empty data
      this.data = createEmptyMetricsData(this.serverName);
      this.initialized = true;
    }
  }

  /**
   * Records a tool invocation.
   * Updates in-memory data immediately, queues async write to disk.
   *
   * @param invocation - The tool invocation to record
   */
  record(invocation: ToolInvocation): void {
    if (!this.initialized) {
      console.error("MetricsCollector not initialized, skipping record");
      return;
    }

    // Update in-memory data immediately
    this.data.invocations.push(invocation);
    this.data.total_invocations++;
    this.data.updated_at = new Date().toISOString();
    this.updateToolStats(invocation);

    // Queue async write (non-blocking, fire-and-forget)
    this.writeQueue = this.writeQueue
      .then(() => this.persistToDisk())
      .catch((error) => {
        console.error("Failed to persist metrics:", error);
      });
  }

  /**
   * Updates aggregated statistics for a tool.
   */
  private updateToolStats(invocation: ToolInvocation): void {
    const toolName = invocation.tool;
    const existing = this.data.tool_stats[toolName];

    if (existing) {
      existing.call_count++;
      existing.total_duration_ms += invocation.duration_ms;
      existing.avg_duration_ms = Math.round(
        existing.total_duration_ms / existing.call_count
      );
      existing.last_used = invocation.timestamp;

      if (invocation.success) {
        existing.success_count++;
      } else {
        existing.error_count++;
      }
    } else {
      // First invocation of this tool
      const stats: ToolStats = {
        call_count: 1,
        total_duration_ms: invocation.duration_ms,
        avg_duration_ms: invocation.duration_ms,
        success_count: invocation.success ? 1 : 0,
        error_count: invocation.success ? 0 : 1,
        last_used: invocation.timestamp,
      };
      this.data.tool_stats[toolName] = stats;
    }
  }

  /**
   * Persists metrics to disk with size enforcement.
   */
  private async persistToDisk(): Promise<void> {
    try {
      // Trim if needed before saving
      trimInvocationsForSize(this.data, this.maxSizeBytes);
      await saveMetrics(this.data);
    } catch (error) {
      console.error("Failed to save metrics:", error);
    }
  }

  /**
   * Gets the current metrics data (for testing/debugging).
   */
  getData(): MetricsData {
    return this.data;
  }

  /**
   * Gets the path to the metrics file.
   */
  getFilePath(): string {
    return getMetricsFilePath(this.serverName);
  }
}
