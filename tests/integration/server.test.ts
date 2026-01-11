import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestClient, extractTextContent, TestContext } from "../helpers.js";

describe("MCP Server Integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestClient();
    // Suppress logger output during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await ctx.cleanup();
    vi.restoreAllMocks();
  });

  describe("tool listing", () => {
    it("should list available tools", async () => {
      const result = await ctx.client.listTools();

      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it("should include echo tool in the list", async () => {
      const result = await ctx.client.listTools();

      const echoTool = result.tools.find((t) => t.name === "echo");
      expect(echoTool).toBeDefined();
      expect(echoTool?.description).toBe("Echoes back the provided message");
    });

    it("should include fetch_url tool in the list", async () => {
      const result = await ctx.client.listTools();

      const fetchTool = result.tools.find((t) => t.name === "fetch_url");
      expect(fetchTool).toBeDefined();
      expect(fetchTool?.description).toContain("Fetches content from a URL");
    });

    it("should include reasoning parameter when metrics enabled", async () => {
      const result = await ctx.client.listTools();
      const echoTool = result.tools.find((t) => t.name === "echo");

      // When metrics are enabled, reasoning should be in the schema
      if (ctx.metricsCollector) {
        const schema = echoTool?.inputSchema as { properties?: Record<string, unknown> };
        expect(schema?.properties?.reasoning).toBeDefined();
      }
    });
  });

  describe("echo tool", () => {
    it("should echo back a simple message", async () => {
      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { 
          message: "Hello, World!",
          reasoning: "Testing echo tool functionality",
        },
      });

      expect(extractTextContent(result)).toBe("Echo: Hello, World!");
    });

    it("should handle empty string", async () => {
      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { 
          message: "",
          reasoning: "Testing empty message handling",
        },
      });

      expect(extractTextContent(result)).toBe("Echo: ");
    });

    it("should handle special characters", async () => {
      const message = "Special chars: !@#$%^&*() 日本語 émojis";
      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { 
          message,
          reasoning: "Testing special character handling",
        },
      });

      expect(extractTextContent(result)).toBe(`Echo: ${message}`);
    });

    it("should handle multiline messages", async () => {
      const message = "Line 1\nLine 2\nLine 3";
      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { 
          message,
          reasoning: "Testing multiline message handling",
        },
      });

      expect(extractTextContent(result)).toBe(`Echo: ${message}`);
    });

    it("should record metrics when enabled", async () => {
      if (!ctx.metricsCollector) {
        // Skip if metrics not enabled
        return;
      }

      await ctx.client.callTool({
        name: "echo",
        arguments: { 
          message: "metrics test",
          reasoning: "Testing that metrics are recorded",
        },
      });

      // Give async write a moment to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const data = ctx.metricsCollector.getData();
      expect(data.total_invocations).toBeGreaterThan(0);
      expect(data.tool_stats.echo).toBeDefined();
      expect(data.tool_stats.echo.call_count).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("should return error for unknown tool", async () => {
      const result = await ctx.client.callTool({
        name: "nonexistent_tool",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(extractTextContent(result)).toContain("not found");
    });

    it("should return error for missing required argument", async () => {
      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { reasoning: "Testing missing argument" },
      });

      expect(result.isError).toBe(true);
    });

    it("should return error for missing reasoning when metrics enabled", async () => {
      if (!ctx.metricsCollector) {
        // Skip if metrics not enabled
        return;
      }

      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { message: "test" },
      });

      expect(result.isError).toBe(true);
    });

    it("should return error for invalid argument type", async () => {
      const result = await ctx.client.callTool({
        name: "echo",
        arguments: { 
          message: 123, // Should be string
          reasoning: "Testing invalid type",
        },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("fetch_url tool", () => {
    it("should fetch a valid URL successfully", async () => {
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/get",
          reasoning: "Testing successful URL fetch",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("httpbin.org");
    });

    it("should return error for invalid URL format", async () => {
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "not-a-valid-url",
          reasoning: "Testing invalid URL handling",
        },
      });

      expect(result.isError).toBe(true);
    });

    it("should handle HTTP errors gracefully", async () => {
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/status/404",
          reasoning: "Testing HTTP error handling",
        },
      });

      expect(result.isError).toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("404");
    });

    it("should accept custom timeout parameter", async () => {
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/get",
          timeout_ms: 5000,
          reasoning: "Testing custom timeout",
        },
      });

      expect(result.isError).not.toBe(true);
    });

    it("should reject timeout outside valid range", async () => {
      // Timeout too low (below 1000)
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/get",
          timeout_ms: 100,
          reasoning: "Testing invalid timeout",
        },
      });

      expect(result.isError).toBe(true);
    });

    it("should handle timeout for slow responses", async () => {
      // httpbin.org/delay/N delays response by N seconds
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/delay/10",
          timeout_ms: 1000, // 1 second timeout
          reasoning: "Testing timeout handling",
        },
      });

      expect(result.isError).toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("timed out");
    });

    it("should handle non-text content types", async () => {
      const result = await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/image/png",
          reasoning: "Testing binary content handling",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("non-text content");
    });

    it("should record metrics for fetch_url when enabled", async () => {
      if (!ctx.metricsCollector) {
        return;
      }

      await ctx.client.callTool({
        name: "fetch_url",
        arguments: {
          url: "https://httpbin.org/get",
          reasoning: "Testing metrics recording for fetch_url",
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const data = ctx.metricsCollector.getData();
      expect(data.tool_stats.fetch_url).toBeDefined();
      expect(data.tool_stats.fetch_url.call_count).toBeGreaterThan(0);
    });
  });

  describe("report_issue tool", () => {
    it("should be available when metrics are enabled", async () => {
      if (!ctx.metricsCollector) {
        return;
      }

      const result = await ctx.client.listTools();
      const reportIssueTool = result.tools.find((t) => t.name === "report_issue");

      expect(reportIssueTool).toBeDefined();
      expect(reportIssueTool?.description).toContain("bug");
      expect(reportIssueTool?.description).toContain("feature request");
    });

    it("should not be available when metrics are disabled", async () => {
      if (ctx.metricsCollector) {
        // This test only applies when metrics are disabled
        return;
      }

      const result = await ctx.client.listTools();
      const reportIssueTool = result.tools.find((t) => t.name === "report_issue");

      expect(reportIssueTool).toBeUndefined();
    });

    it("should report a bug successfully", async () => {
      if (!ctx.issueCollector) {
        return;
      }

      const result = await ctx.client.callTool({
        name: "report_issue",
        arguments: {
          title: "Test bug report",
          description: "This is a test bug report for integration testing purposes.",
          severity: "low",
          category: "bug",
          reasoning: "Testing issue reporting functionality",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("Issue reported successfully");
      expect(text).toContain("Test bug report");
      expect(text).toContain("Bug");
      expect(text).toContain("low");
    });

    it("should report a feature request successfully", async () => {
      if (!ctx.issueCollector) {
        return;
      }

      const result = await ctx.client.callTool({
        name: "report_issue",
        arguments: {
          title: "Add dark mode support",
          description: "It would be great to have a dark mode option for better visibility at night.",
          severity: "medium",
          category: "feature_request",
          expected_behavior: "A toggle to switch between light and dark themes",
          reasoning: "Testing feature request reporting",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("Issue reported successfully");
      expect(text).toContain("Feature request");
    });

    it("should save issue to collector data", async () => {
      if (!ctx.issueCollector) {
        return;
      }

      const initialCount = ctx.issueCollector.getData().total_issues;

      await ctx.client.callTool({
        name: "report_issue",
        arguments: {
          title: "Test issue for data verification",
          description: "Verifying that issues are saved to the collector.",
          severity: "high",
          category: "performance",
          reasoning: "Testing issue data persistence",
        },
      });

      // Give async write a moment to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const data = ctx.issueCollector.getData();
      expect(data.total_issues).toBe(initialCount + 1);
      expect(data.issues[0].title).toBe("Test issue for data verification");
      expect(data.issues[0].severity).toBe("high");
      expect(data.issues[0].category).toBe("performance");
    });

    it("should reject title that is too short", async () => {
      if (!ctx.issueCollector) {
        return;
      }

      const result = await ctx.client.callTool({
        name: "report_issue",
        arguments: {
          title: "Hi", // Too short (min 5 chars)
          description: "This is a valid description that meets the minimum length requirement.",
          reasoning: "Testing validation",
        },
      });

      expect(result.isError).toBe(true);
    });

    it("should reject description that is too short", async () => {
      if (!ctx.issueCollector) {
        return;
      }

      const result = await ctx.client.callTool({
        name: "report_issue",
        arguments: {
          title: "Valid title here",
          description: "Too short", // Too short (min 10 chars)
          reasoning: "Testing validation",
        },
      });

      expect(result.isError).toBe(true);
    });

    it("should include all optional fields in saved issue", async () => {
      if (!ctx.issueCollector) {
        return;
      }

      await ctx.client.callTool({
        name: "report_issue",
        arguments: {
          title: "Complete issue with all fields",
          description: "Testing that all optional fields are saved correctly.",
          severity: "critical",
          category: "security",
          steps_to_reproduce: "1. Do this\n2. Do that\n3. Observe the issue",
          expected_behavior: "Should not crash",
          actual_behavior: "Crashes immediately",
          environment: "Node.js 20, macOS 14",
          reasoning: "Testing all optional fields",
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const data = ctx.issueCollector.getData();
      const issue = data.issues[0];

      expect(issue.steps_to_reproduce).toBe("1. Do this\n2. Do that\n3. Observe the issue");
      expect(issue.expected_behavior).toBe("Should not crash");
      expect(issue.actual_behavior).toBe("Crashes immediately");
      expect(issue.environment).toBe("Node.js 20, macOS 14");
    });
  });
});
