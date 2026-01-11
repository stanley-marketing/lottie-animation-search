/**
 * Tool wrapper utilities for metrics collection.
 *
 * Provides two wrapper functions:
 * - createMetricsWrapper: Adds reasoning requirement and records metrics
 * - createIdentityWrapper: Pass-through wrapper when metrics are disabled
 */

import { z } from "zod";
import { MetricsCollector, ToolInvocation } from "../metrics/index.js";
import { WrapToolFn, WrappedTool, ToolHandler, ToolExtra } from "../types/tool.js";

/**
 * Creates a tool wrapper that adds reasoning requirement and records metrics.
 *
 * When a tool is wrapped:
 * 1. A 'reasoning' parameter is added to the schema (required)
 * 2. Execution time is measured
 * 3. Invocation is recorded to the metrics collector
 *
 * @param collector - The MetricsCollector instance
 * @returns A WrapToolFn that wraps tools with metrics
 */
export function createMetricsWrapper(collector: MetricsCollector): WrapToolFn {
  return function wrapTool<T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: ToolHandler<T>
  ): WrappedTool<T> {
    // Add reasoning parameter to the schema
    const wrappedSchema = {
      ...schema,
      reasoning: z
        .string()
        .describe("Explain why you are using this tool - helps track usage patterns and optimize the server"),
    } as T; // Type assertion needed due to dynamic schema extension

    // Create wrapped handler that extracts reasoning, measures time, and records metrics
    const wrappedHandler: ToolHandler<T> = async (args, extra) => {
      const startTime = Date.now();
      const { reasoning, ...toolArgs } = args as Record<string, unknown> & { reasoning: string };

      try {
        // Call the original handler without the reasoning parameter
        const result = await handler(toolArgs as z.infer<z.ZodObject<T>>, extra);
        const duration = Date.now() - startTime;

        // Record successful invocation
        const invocation: ToolInvocation = {
          tool: name,
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          reasoning,
          arguments: toolArgs,
          success: true,
          result,
        };
        collector.record(invocation);

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Record failed invocation
        const invocation: ToolInvocation = {
          tool: name,
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          reasoning,
          arguments: toolArgs,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        collector.record(invocation);

        throw error;
      }
    };

    return {
      name,
      description,
      schema: wrappedSchema,
      handler: wrappedHandler,
    };
  };
}

/**
 * Creates an identity wrapper that passes tools through unchanged.
 * Used when metrics are disabled.
 *
 * @returns A WrapToolFn that returns tools unchanged
 */
export function createIdentityWrapper(): WrapToolFn {
  return function wrapTool<T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: ToolHandler<T>
  ): WrappedTool<T> {
    return {
      name,
      description,
      schema,
      handler,
    };
  };
}
