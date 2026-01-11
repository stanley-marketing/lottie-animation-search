import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";
import { getEnvAsNumber } from "../utils/env.js";

const log = createLogger("fetch_url");

/**
 * Default timeout for fetch requests in milliseconds.
 * Can be overridden with FETCH_TIMEOUT_MS environment variable.
 */
const DEFAULT_TIMEOUT_MS = getEnvAsNumber("FETCH_TIMEOUT_MS", 10000);

/**
 * Maximum response size to return (to avoid overwhelming the LLM).
 */
const MAX_RESPONSE_SIZE = 50000; // 50KB

/**
 * Fetches content from a URL with timeout and error handling.
 *
 * This is a realistic example tool that demonstrates:
 * - Async operations with proper error handling
 * - Timeout handling with AbortController
 * - Using the logger utility
 * - Environment variable configuration
 * - Graceful degradation (truncating large responses)
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "fetch_url",
    "Fetches content from a URL and returns the response text. Useful for retrieving web pages, API responses, or any HTTP resource.",
    {
      url: z.string().url().describe("The URL to fetch (must be a valid http or https URL)"),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(30000)
        .optional()
        .describe("Request timeout in milliseconds (1000-30000, default: 10000)"),
    },
    async ({ url, timeout_ms }) => {
      const timeout = timeout_ms ?? DEFAULT_TIMEOUT_MS;
      log.debug("Fetching URL", { url, timeout });

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            // Identify as a bot/tool for transparency
            "User-Agent": "MCP-Server-Template/1.0 (Tool; +https://github.com/modelcontextprotocol)",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          log.warn("Fetch failed with HTTP error", {
            url,
            status: response.status,
            statusText: response.statusText,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }

        // Get content type to determine how to handle the response
        const contentType = response.headers.get("content-type") || "";
        const isText =
          contentType.includes("text/") ||
          contentType.includes("application/json") ||
          contentType.includes("application/xml") ||
          contentType.includes("application/javascript");

        if (!isText) {
          log.debug("Non-text content type", { url, contentType });
          return {
            content: [
              {
                type: "text" as const,
                text: `URL returned non-text content (${contentType}). Binary content cannot be displayed.`,
              },
            ],
          };
        }

        let text = await response.text();
        let truncated = false;

        // Truncate if too large
        if (text.length > MAX_RESPONSE_SIZE) {
          text = text.substring(0, MAX_RESPONSE_SIZE);
          truncated = true;
          log.debug("Response truncated", {
            url,
            originalLength: text.length,
            truncatedTo: MAX_RESPONSE_SIZE,
          });
        }

        log.info("Successfully fetched URL", {
          url,
          contentLength: text.length,
          truncated,
        });

        const result = truncated
          ? `${text}\n\n[Response truncated - original size exceeded ${MAX_RESPONSE_SIZE} characters]`
          : text;

        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (error) {
        clearTimeout(timeoutId);

        // Handle specific error types
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            log.warn("Request timed out", { url, timeout });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Request timed out after ${timeout}ms. The server took too long to respond.`,
                },
              ],
              isError: true,
            };
          }

          // Network errors, DNS failures, etc.
          log.error("Fetch failed", { url, error: error.message });
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch URL: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        // Unknown error type
        log.error("Unexpected error during fetch", { url, error });
        return {
          content: [
            {
              type: "text" as const,
              text: "An unexpected error occurred while fetching the URL.",
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
