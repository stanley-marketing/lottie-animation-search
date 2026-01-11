/**
 * Built-in report_issue tool for MCP servers.
 *
 * This tool is automatically registered when metrics are enabled,
 * allowing users to report bugs, feature requests, or other issues.
 * Issues are saved locally alongside the metrics data.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IssueCollector } from "./issues.js";
import {
  ISSUE_SEVERITY_LEVELS,
  ISSUE_CATEGORIES,
  IssueSeverity,
  IssueCategory,
} from "./types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("report_issue");

/**
 * Schema for the report_issue tool parameters.
 */
const reportIssueSchema = {
  title: z
    .string()
    .min(5)
    .max(200)
    .describe("A brief, descriptive title for the issue"),
  description: z
    .string()
    .min(10)
    .max(5000)
    .describe("Detailed description of the issue or request"),
  severity: z
    .enum(ISSUE_SEVERITY_LEVELS)
    .default("medium")
    .describe("How severe is this issue? (low, medium, high, critical)"),
  category: z
    .enum(ISSUE_CATEGORIES)
    .default("bug")
    .describe(
      "Type of issue: bug, feature_request, documentation, performance, security, or other"
    ),
  steps_to_reproduce: z
    .string()
    .max(2000)
    .optional()
    .describe("Step-by-step instructions to reproduce the issue (for bugs)"),
  expected_behavior: z
    .string()
    .max(1000)
    .optional()
    .describe("What you expected to happen"),
  actual_behavior: z
    .string()
    .max(1000)
    .optional()
    .describe("What actually happened"),
  environment: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Environment details like OS, Node version, or other relevant context"
    ),
  reasoning: z
    .string()
    .describe("Explain why you are reporting this issue - helps track usage patterns"),
};

/**
 * Registers the report_issue tool with the MCP server.
 * This is a built-in tool that's automatically added when metrics are enabled.
 *
 * @param server - The MCP server instance
 * @param issueCollector - The issue collector for persisting reports
 * @param serverName - The server name (for display in success message)
 */
export function registerReportIssueTool(
  server: McpServer,
  issueCollector: IssueCollector,
  serverName: string
): void {
  server.tool(
    "report_issue",
    "Report a bug, feature request, or other issue with the MCP server. Issues are saved locally for the server maintainer to review.",
    reportIssueSchema,
    async ({
      title,
      description,
      severity,
      category,
      steps_to_reproduce,
      expected_behavior,
      actual_behavior,
      environment,
    }) => {
      log.debug("Creating new issue report", { title, severity, category });

      try {
        const issue = issueCollector.report({
          title,
          description,
          severity: severity as IssueSeverity,
          category: category as IssueCategory,
          steps_to_reproduce,
          expected_behavior,
          actual_behavior,
          environment,
        });

        log.info("Issue reported successfully", {
          id: issue.id,
          title,
          severity,
          category,
        });

        const filePath = issueCollector.getFilePath();
        const categoryLabel =
          category === "feature_request"
            ? "Feature request"
            : category.charAt(0).toUpperCase() + category.slice(1);

        return {
          content: [
            {
              type: "text" as const,
              text: `Issue reported successfully!

**Issue ID:** ${issue.id}
**Type:** ${categoryLabel}
**Severity:** ${severity}
**Title:** ${title}

Your issue has been saved to:
${filePath}

The server maintainer will review reported issues. Thank you for helping improve ${serverName}!`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        log.error("Failed to save issue report", { error: errorMessage });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to save issue report: ${errorMessage}

Please try again or report the issue manually to the server maintainer.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
