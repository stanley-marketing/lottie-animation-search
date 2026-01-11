/**
 * Metrics data types for MCP server analytics.
 */

// =============================================================================
// Tool Invocation Types
// =============================================================================

/**
 * Represents a single tool invocation record.
 */
export interface ToolInvocation {
  /** Tool name that was invoked */
  tool: string;

  /** ISO 8601 timestamp when the tool was called */
  timestamp: string;

  /** Execution duration in milliseconds */
  duration_ms: number;

  /** Caller's explanation for using this tool */
  reasoning: string;

  /** Input arguments passed to the tool (excluding reasoning) */
  arguments: Record<string, unknown>;

  /** Whether the tool executed successfully */
  success: boolean;

  /** Error message if the tool failed */
  error?: string;

  /** Full result returned by the tool */
  result?: unknown;
}

/**
 * Aggregated statistics for a single tool.
 */
export interface ToolStats {
  /** Total number of times this tool was called */
  call_count: number;

  /** Sum of all execution durations in milliseconds */
  total_duration_ms: number;

  /** Average execution duration in milliseconds */
  avg_duration_ms: number;

  /** Number of successful invocations */
  success_count: number;

  /** Number of failed invocations */
  error_count: number;

  /** ISO 8601 timestamp of the most recent invocation */
  last_used: string;
}

/**
 * Complete metrics data structure stored in the JSON file.
 */
export interface MetricsData {
  /** Server name from config */
  server_name: string;

  /** ISO 8601 timestamp when metrics collection started */
  created_at: string;

  /** ISO 8601 timestamp of the last update */
  updated_at: string;

  /** Total number of tool invocations recorded */
  total_invocations: number;

  /** Aggregated statistics per tool (key is tool name) */
  tool_stats: Record<string, ToolStats>;

  /** Individual invocation records (oldest may be trimmed for size) */
  invocations: ToolInvocation[];
}

/**
 * Creates an empty MetricsData structure for a new server.
 */
export function createEmptyMetricsData(serverName: string): MetricsData {
  const now = new Date().toISOString();
  return {
    server_name: serverName,
    created_at: now,
    updated_at: now,
    total_invocations: 0,
    tool_stats: {},
    invocations: [],
  };
}

// =============================================================================
// Issue Report Types
// =============================================================================

/**
 * Issue severity levels.
 */
export const ISSUE_SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITY_LEVELS)[number];

/**
 * Issue categories for better organization.
 */
export const ISSUE_CATEGORIES = [
  "bug",
  "feature_request",
  "documentation",
  "performance",
  "security",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

/**
 * Represents a single issue report.
 */
export interface IssueReport {
  /** Unique identifier for the issue */
  id: string;

  /** Brief, descriptive title */
  title: string;

  /** Detailed description of the issue */
  description: string;

  /** How severe is the issue */
  severity: IssueSeverity;

  /** Type of issue */
  category: IssueCategory;

  /** Steps to reproduce (for bugs) */
  steps_to_reproduce?: string;

  /** What was expected to happen */
  expected_behavior?: string;

  /** What actually happened */
  actual_behavior?: string;

  /** Environment details (OS, Node version, etc.) */
  environment?: string;

  /** ISO 8601 timestamp when the issue was reported */
  created_at: string;
}

/**
 * Complete issue data structure stored in the JSON file.
 */
export interface IssuesData {
  /** Server name from config */
  server_name: string;

  /** ISO 8601 timestamp when issue tracking started */
  created_at: string;

  /** ISO 8601 timestamp of the last update */
  updated_at: string;

  /** Total number of issues reported */
  total_issues: number;

  /** Individual issue reports (newest first) */
  issues: IssueReport[];
}

/**
 * Creates an empty IssuesData structure for a new server.
 */
export function createEmptyIssuesData(serverName: string): IssuesData {
  const now = new Date().toISOString();
  return {
    server_name: serverName,
    created_at: now,
    updated_at: now,
    total_issues: 0,
    issues: [],
  };
}
