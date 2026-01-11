import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createMetricsWrapper, createIdentityWrapper } from "../../src/tools/wrapper.js";
import { MetricsCollector } from "../../src/metrics/index.js";
import { ToolExtra } from "../../src/types/tool.js";

const METRICS_DIR = join(homedir(), ".mcp-metrics");

// Generate unique server name for each test to avoid cross-contamination
function getTestServerName(): string {
  return `test-wrapper-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// Mock extra context
const mockExtra = {} as ToolExtra;

describe("createIdentityWrapper", () => {
  it("should return tool unchanged", () => {
    const wrapTool = createIdentityWrapper();
    
    const tool = wrapTool(
      "test_tool",
      "A test tool",
      { input: z.string() },
      async ({ input }) => ({
        content: [{ type: "text" as const, text: input }],
      })
    );

    expect(tool.name).toBe("test_tool");
    expect(tool.description).toBe("A test tool");
    expect(tool.schema).toHaveProperty("input");
    expect(tool.schema).not.toHaveProperty("reasoning");
  });

  it("should preserve handler functionality", async () => {
    const wrapTool = createIdentityWrapper();
    
    const tool = wrapTool(
      "echo",
      "Echo tool",
      { message: z.string() },
      async ({ message }) => ({
        content: [{ type: "text" as const, text: `Echo: ${message}` }],
      })
    );

    const result = await tool.handler({ message: "hello" }, mockExtra);
    expect(result.content[0]).toEqual({ type: "text", text: "Echo: hello" });
  });
});

describe("createMetricsWrapper", () => {
  let collector: MetricsCollector;
  let testServerName: string;
  let testMetricsFile: string;

  beforeEach(async () => {
    testServerName = getTestServerName();
    testMetricsFile = join(METRICS_DIR, `${testServerName}.json`);
    
    collector = new MetricsCollector(testServerName, 1024 * 1024);
    await collector.initialize();
  });

  afterEach(async () => {
    if (existsSync(testMetricsFile)) {
      await rm(testMetricsFile);
    }
  });

  it("should add reasoning parameter to schema", () => {
    const wrapTool = createMetricsWrapper(collector);
    
    const tool = wrapTool(
      "test_tool",
      "A test tool",
      { input: z.string() },
      async ({ input }) => ({
        content: [{ type: "text" as const, text: input }],
      })
    );

    expect(tool.schema).toHaveProperty("reasoning");
    // Access via indexing to avoid TypeScript error
    expect((tool.schema as Record<string, unknown>)["reasoning"]).toBeDefined();
  });

  it("should record successful invocations", async () => {
    const wrapTool = createMetricsWrapper(collector);
    
    const tool = wrapTool(
      "test_tool",
      "A test tool",
      { input: z.string() },
      async ({ input }) => ({
        content: [{ type: "text" as const, text: input }],
      })
    );

    // The wrapper adds reasoning to the schema, so we pass it as part of args
    // Using type assertion since TypeScript doesn't know about the added field
    await tool.handler(
      { input: "test", reasoning: "Testing metrics recording" } as { input: string },
      mockExtra
    );

    // Wait for async write
    await new Promise(resolve => setTimeout(resolve, 50));

    const data = collector.getData();
    expect(data.total_invocations).toBe(1);
    expect(data.invocations[0].success).toBe(true);
    expect(data.invocations[0].reasoning).toBe("Testing metrics recording");
    expect(data.invocations[0].arguments).toEqual({ input: "test" });
  });

  it("should record failed invocations", async () => {
    const wrapTool = createMetricsWrapper(collector);
    
    const tool = wrapTool(
      "failing_tool",
      "A tool that fails",
      { input: z.string() },
      async () => {
        throw new Error("Tool failed!");
      }
    );

    await expect(
      tool.handler(
        { input: "test", reasoning: "Testing error handling" } as { input: string },
        mockExtra
      )
    ).rejects.toThrow("Tool failed!");

    // Wait for async write
    await new Promise(resolve => setTimeout(resolve, 50));

    const data = collector.getData();
    expect(data.total_invocations).toBe(1);
    expect(data.invocations[0].success).toBe(false);
    expect(data.invocations[0].error).toBe("Tool failed!");
  });

  it("should measure execution duration", async () => {
    const wrapTool = createMetricsWrapper(collector);
    
    const tool = wrapTool(
      "slow_tool",
      "A slow tool",
      { input: z.string() },
      async ({ input }) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { content: [{ type: "text" as const, text: input }] };
      }
    );

    await tool.handler(
      { input: "test", reasoning: "Testing duration" } as { input: string },
      mockExtra
    );

    const data = collector.getData();
    expect(data.invocations[0].duration_ms).toBeGreaterThanOrEqual(50);
    expect(data.invocations[0].duration_ms).toBeLessThan(200);
  });

  it("should store full result in metrics", async () => {
    const wrapTool = createMetricsWrapper(collector);
    
    const expectedResult = {
      content: [
        { type: "text" as const, text: "Line 1" },
        { type: "text" as const, text: "Line 2" },
      ],
    };

    const tool = wrapTool(
      "multi_result_tool",
      "Returns multiple content items",
      { input: z.string() },
      async () => expectedResult
    );

    await tool.handler(
      { input: "test", reasoning: "Testing result storage" } as { input: string },
      mockExtra
    );

    const data = collector.getData();
    expect(data.invocations[0].result).toEqual(expectedResult);
  });

  it("should not include reasoning in recorded arguments", async () => {
    const wrapTool = createMetricsWrapper(collector);
    
    const tool = wrapTool(
      "args_tool",
      "Tool with multiple args",
      { 
        arg1: z.string(),
        arg2: z.number(),
      },
      async ({ arg1, arg2 }) => ({
        content: [{ type: "text" as const, text: `${arg1}: ${arg2}` }],
      })
    );

    await tool.handler(
      { arg1: "test", arg2: 42, reasoning: "Should not be in args" } as { arg1: string; arg2: number },
      mockExtra
    );

    const data = collector.getData();
    expect(data.invocations[0].arguments).toEqual({ arg1: "test", arg2: 42 });
    expect(data.invocations[0].arguments).not.toHaveProperty("reasoning");
  });
});
