import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";
import { CONFIG, isMetricsEnabled } from "./config.js";
import {
  MetricsCollector,
  IssueCollector,
  registerReportIssueTool,
} from "./metrics/index.js";
import { createMetricsWrapper, createIdentityWrapper } from "./tools/wrapper.js";
import { WrapToolFn } from "./types/tool.js";

/**
 * Server initialization result containing both the server and optional metrics/issues collectors.
 */
export interface ServerContext {
  server: McpServer;
  metricsCollector: MetricsCollector | null;
  issueCollector: IssueCollector | null;
}

/**
 * Creates and configures the MCP server with all tools registered.
 * If metrics are enabled, initializes the metrics collector and wraps tools.
 *
 * @returns Promise resolving to ServerContext with server and optional collector
 */
export async function createServer(): Promise<ServerContext> {
  const server = new McpServer(
    {
      name: CONFIG.serverName,
      version: CONFIG.serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  let wrapTool: WrapToolFn;
  let metricsCollector: MetricsCollector | null = null;
  let issueCollector: IssueCollector | null = null;

  if (isMetricsEnabled()) {
    // Initialize metrics collector
    metricsCollector = new MetricsCollector(
      CONFIG.serverName,
      CONFIG.metricsMaxSizeBytes
    );
    await metricsCollector.initialize();
    wrapTool = createMetricsWrapper(metricsCollector);

    // Initialize issue collector and register built-in report_issue tool
    issueCollector = new IssueCollector(CONFIG.serverName);
    await issueCollector.initialize();
    registerReportIssueTool(server, issueCollector, CONFIG.serverName);
  } else {
    // No metrics - use identity wrapper
    wrapTool = createIdentityWrapper();
  }

  registerTools(server, wrapTool);

  return { server, metricsCollector, issueCollector };
}
