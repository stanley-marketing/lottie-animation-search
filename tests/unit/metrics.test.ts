import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { MetricsCollector, ToolInvocation, createEmptyMetricsData } from "../../src/metrics/index.js";
import { trimInvocationsForSize } from "../../src/metrics/storage.js";

const METRICS_DIR = join(homedir(), ".mcp-metrics");

// Generate unique server name for each test to avoid cross-contamination
function getTestServerName(): string {
  return `test-metrics-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

describe("MetricsCollector", () => {
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
    // Clean up test metrics file
    if (existsSync(testMetricsFile)) {
      await rm(testMetricsFile);
    }
  });

  it("should create metrics file on initialization", async () => {
    expect(existsSync(testMetricsFile)).toBe(true);
  });

  it("should record a tool invocation", async () => {
    const invocation: ToolInvocation = {
      tool: "test_tool",
      timestamp: new Date().toISOString(),
      duration_ms: 100,
      reasoning: "Testing the tool",
      arguments: { arg1: "value1" },
      success: true,
      result: { content: [{ type: "text", text: "result" }] },
    };

    collector.record(invocation);

    const data = collector.getData();
    expect(data.total_invocations).toBe(1);
    expect(data.invocations).toHaveLength(1);
    expect(data.invocations[0].tool).toBe("test_tool");
    expect(data.invocations[0].reasoning).toBe("Testing the tool");
  });

  it("should update tool stats on invocation", async () => {
    const invocation: ToolInvocation = {
      tool: "test_tool",
      timestamp: new Date().toISOString(),
      duration_ms: 100,
      reasoning: "Testing stats",
      arguments: {},
      success: true,
    };

    collector.record(invocation);

    const data = collector.getData();
    expect(data.tool_stats.test_tool).toBeDefined();
    expect(data.tool_stats.test_tool.call_count).toBe(1);
    expect(data.tool_stats.test_tool.avg_duration_ms).toBe(100);
    expect(data.tool_stats.test_tool.success_count).toBe(1);
    expect(data.tool_stats.test_tool.error_count).toBe(0);
  });

  it("should track error invocations separately", async () => {
    const successInvocation: ToolInvocation = {
      tool: "test_tool",
      timestamp: new Date().toISOString(),
      duration_ms: 50,
      reasoning: "Success test",
      arguments: {},
      success: true,
    };

    const errorInvocation: ToolInvocation = {
      tool: "test_tool",
      timestamp: new Date().toISOString(),
      duration_ms: 10,
      reasoning: "Error test",
      arguments: {},
      success: false,
      error: "Something went wrong",
    };

    collector.record(successInvocation);
    collector.record(errorInvocation);

    const data = collector.getData();
    expect(data.tool_stats.test_tool.success_count).toBe(1);
    expect(data.tool_stats.test_tool.error_count).toBe(1);
    expect(data.tool_stats.test_tool.call_count).toBe(2);
  });

  it("should calculate average duration correctly", async () => {
    const invocations: ToolInvocation[] = [
      { tool: "test_tool", timestamp: new Date().toISOString(), duration_ms: 100, reasoning: "test1", arguments: {}, success: true },
      { tool: "test_tool", timestamp: new Date().toISOString(), duration_ms: 200, reasoning: "test2", arguments: {}, success: true },
      { tool: "test_tool", timestamp: new Date().toISOString(), duration_ms: 300, reasoning: "test3", arguments: {}, success: true },
    ];

    for (const inv of invocations) {
      collector.record(inv);
    }

    const data = collector.getData();
    expect(data.tool_stats.test_tool.avg_duration_ms).toBe(200); // (100+200+300)/3 = 200
    expect(data.tool_stats.test_tool.total_duration_ms).toBe(600);
  });

  it("should persist data to disk asynchronously", async () => {
    const invocation: ToolInvocation = {
      tool: "persist_test",
      timestamp: new Date().toISOString(),
      duration_ms: 50,
      reasoning: "Testing persistence",
      arguments: { test: true },
      success: true,
    };

    collector.record(invocation);

    // Wait for async write
    await new Promise(resolve => setTimeout(resolve, 100));

    // Read file directly to verify persistence
    const content = await readFile(testMetricsFile, "utf-8");
    const savedData = JSON.parse(content);

    expect(savedData.total_invocations).toBe(1);
    expect(savedData.invocations[0].tool).toBe("persist_test");
  });
});

describe("trimInvocationsForSize", () => {
  it("should not trim when under size limit", () => {
    const data = createEmptyMetricsData("test");
    data.invocations = [
      { tool: "t1", timestamp: "", duration_ms: 1, reasoning: "r", arguments: {}, success: true },
      { tool: "t2", timestamp: "", duration_ms: 1, reasoning: "r", arguments: {}, success: true },
    ];

    const result = trimInvocationsForSize(data, 1024 * 1024); // 1MB limit

    expect(result.invocations).toHaveLength(2);
  });

  it("should trim oldest invocations when over size limit", () => {
    const data = createEmptyMetricsData("test");
    
    // Create enough invocations to exceed a small limit
    for (let i = 0; i < 100; i++) {
      data.invocations.push({
        tool: `tool_${i}`,
        timestamp: new Date().toISOString(),
        duration_ms: i,
        reasoning: "r".repeat(100), // Make each invocation reasonably sized
        arguments: { index: i },
        success: true,
      });
    }

    const originalLength = data.invocations.length;
    const result = trimInvocationsForSize(data, 5000); // Very small limit

    expect(result.invocations.length).toBeLessThan(originalLength);
  });

  it("should preserve tool_stats when trimming", () => {
    const data = createEmptyMetricsData("test");
    data.tool_stats = {
      my_tool: {
        call_count: 100,
        total_duration_ms: 5000,
        avg_duration_ms: 50,
        success_count: 95,
        error_count: 5,
        last_used: new Date().toISOString(),
      },
    };

    for (let i = 0; i < 50; i++) {
      data.invocations.push({
        tool: "my_tool",
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        reasoning: "r".repeat(200),
        arguments: { i },
        success: true,
      });
    }

    const result = trimInvocationsForSize(data, 5000);

    // Stats should be preserved
    expect(result.tool_stats.my_tool.call_count).toBe(100);
    expect(result.tool_stats.my_tool.success_count).toBe(95);
  });
});
