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

    it("should include search_animations tool in the list", async () => {
      const result = await ctx.client.listTools();

      const searchTool = result.tools.find((t) => t.name === "search_animations");
      expect(searchTool).toBeDefined();
      expect(searchTool?.description).toContain("Search for free Lottie animations");
    });

    it("should include get_animation tool in the list", async () => {
      const result = await ctx.client.listTools();

      const getTool = result.tools.find((t) => t.name === "get_animation");
      expect(getTool).toBeDefined();
      expect(getTool?.description).toContain("detailed information");
    });

    it("should include list_popular tool in the list", async () => {
      const result = await ctx.client.listTools();

      const popularTool = result.tools.find((t) => t.name === "list_popular");
      expect(popularTool).toBeDefined();
      expect(popularTool?.description).toContain("popular");
    });

    it("should include download_animation tool in the list", async () => {
      const result = await ctx.client.listTools();

      const downloadTool = result.tools.find((t) => t.name === "download_animation");
      expect(downloadTool).toBeDefined();
      expect(downloadTool?.description).toContain("Download");
    });

    it("should include reasoning parameter when metrics enabled", async () => {
      const result = await ctx.client.listTools();
      const searchTool = result.tools.find((t) => t.name === "search_animations");

      // When metrics are enabled, reasoning should be in the schema
      if (ctx.metricsCollector) {
        const schema = searchTool?.inputSchema as { properties?: Record<string, unknown> };
        expect(schema?.properties?.reasoning).toBeDefined();
      }
    });
  });

  describe("search_animations tool", () => {
    it("should search for animations with a query", async () => {
      const result = await ctx.client.callTool({
        name: "search_animations",
        arguments: { 
          query: "loading",
          limit: 3,
          reasoning: "Testing search functionality",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("loading");
    });

    it("should return download URLs in results", async () => {
      const result = await ctx.client.callTool({
        name: "search_animations",
        arguments: { 
          query: "spinner",
          limit: 3,
          reasoning: "Testing URL presence in results",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      // Should contain some kind of URL
      expect(text).toMatch(/https?:\/\//);
    });

    it("should handle any search query without error", async () => {
      const result = await ctx.client.callTool({
        name: "search_animations",
        arguments: { 
          query: "xyznonexistent123456789",
          reasoning: "Testing search handles any query",
        },
      });

      // LottieFiles API uses fuzzy matching, so most queries return results
      // The important thing is that it doesn't error
      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      // Should either find results or return a "no animations found" message
      expect(text.includes("Found") || text.includes("No animations found")).toBe(true);
    });

    it("should record metrics when enabled", async () => {
      if (!ctx.metricsCollector) {
        return;
      }

      await ctx.client.callTool({
        name: "search_animations",
        arguments: { 
          query: "heart",
          limit: 1,
          reasoning: "Testing that metrics are recorded",
        },
      });

      // Give async write a moment to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const data = ctx.metricsCollector.getData();
      expect(data.total_invocations).toBeGreaterThan(0);
      expect(data.tool_stats.search_animations).toBeDefined();
      expect(data.tool_stats.search_animations.call_count).toBeGreaterThan(0);
    });
  });

  describe("download_animation tool", () => {
    it("should reject untrusted URLs", async () => {
      const result = await ctx.client.callTool({
        name: "download_animation",
        arguments: {
          url: "https://evil.com/malware.json",
          reasoning: "Testing URL security validation",
        },
      });

      expect(result.isError).toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("security");
    });

    it("should handle dotLottie format with guidance", async () => {
      const result = await ctx.client.callTool({
        name: "download_animation",
        arguments: {
          url: "https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie",
          reasoning: "Testing dotLottie format handling",
        },
      });

      expect(result.isError).not.toBe(true);
      const text = extractTextContent(result);
      expect(text).toContain("dotLottie");
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
        name: "search_animations",
        arguments: { reasoning: "Testing missing argument" },
      });

      expect(result.isError).toBe(true);
    });

    it("should return error for missing reasoning when metrics enabled", async () => {
      if (!ctx.metricsCollector) {
        return;
      }

      const result = await ctx.client.callTool({
        name: "search_animations",
        arguments: { query: "test" },
      });

      expect(result.isError).toBe(true);
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
  });
});
