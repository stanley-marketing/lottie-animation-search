import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WrapToolFn } from "../types/tool.js";
import * as echo from "./echo.js";
import * as fetchUrl from "./fetch_url.js";

/**
 * All tool modules to register.
 * Add new tools here as you create them.
 *
 * Note: The built-in `report_issue` tool is automatically registered
 * when metrics are enabled. See src/metrics/report_issue_tool.ts
 */
const tools = [echo, fetchUrl];

/**
 * Registers all tools with the MCP server.
 *
 * @param server - The MCP server instance
 * @param wrapTool - Function to wrap tools with metrics (if enabled)
 */
export function registerTools(server: McpServer, wrapTool: WrapToolFn): void {
  for (const tool of tools) {
    tool.register(server, wrapTool);
  }
}
