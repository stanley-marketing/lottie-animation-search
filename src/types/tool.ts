import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";

/**
 * Interface for tool modules.
 * Each tool module exports a single register function.
 */
export interface ToolModule {
  register: ToolRegistrar;
}

/**
 * Extra context passed to tool handlers by the MCP SDK.
 */
export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Tool handler function type - matches MCP SDK expectations.
 */
export type ToolHandler<T extends z.ZodRawShape> = (
  args: z.infer<z.ZodObject<T>>,
  extra: ToolExtra
) => CallToolResult | Promise<CallToolResult>;

/**
 * Wrapped tool ready for registration with the server.
 */
export interface WrappedTool<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  schema: T;
  handler: ToolHandler<T>;
}

/**
 * Function that wraps a tool with optional metrics collection.
 * When metrics are enabled, this adds the reasoning parameter and timing.
 * When disabled, it passes through unchanged.
 */
export type WrapToolFn = <T extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: T,
  handler: ToolHandler<T>
) => WrappedTool<T>;

/**
 * Tool registration function signature.
 * Each tool module exports a register function matching this type.
 *
 * @param server - The MCP server instance
 * @param wrapTool - Function to wrap tools with metrics (if enabled)
 */
export type ToolRegistrar = (server: McpServer, wrapTool: WrapToolFn) => void;
