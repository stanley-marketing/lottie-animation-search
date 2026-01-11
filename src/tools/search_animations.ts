import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("search_animations");

/**
 * LottieFiles GraphQL API endpoint (public, no auth required)
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for searching animations
 */
const SEARCH_QUERY = `
  query SearchAnimations($query: String!, $limit: Int!) {
    searchPublicAnimations(query: $query, first: $limit) {
      totalCount
      edges {
        cursor
        node {
          id
          slug
          name
          description
          likesCount
          downloads
          gifUrl
          lottieUrl
          jsonUrl
          createdAt
          createdBy {
            username
            avatarUrl
          }
        }
      }
    }
  }
`;

interface LottieAnimation {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  likesCount: number;
  downloads: number;
  gifUrl: string | null;
  lottieUrl: string | null;
  jsonUrl: string | null;
  createdAt: string;
  createdBy: {
    username: string;
    avatarUrl: string | null;
  } | null;
}

interface SearchResponse {
  data: {
    searchPublicAnimations: {
      totalCount: number;
      edges: Array<{
        cursor: string;
        node: LottieAnimation;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Formats a single animation result for display
 */
function formatAnimation(anim: LottieAnimation, index: number): string {
  const lines: string[] = [
    `${index + 1}. **${anim.name}**`,
    `   ID: ${anim.id}`,
  ];

  if (anim.description) {
    lines.push(`   Description: ${anim.description.slice(0, 100)}${anim.description.length > 100 ? "..." : ""}`);
  }

  if (anim.createdBy) {
    lines.push(`   Creator: ${anim.createdBy.username}`);
  }

  lines.push(`   Downloads: ${anim.downloads.toLocaleString()} | Likes: ${anim.likesCount.toLocaleString()}`);

  // Add download URLs
  if (anim.lottieUrl) {
    lines.push(`   dotLottie URL: ${anim.lottieUrl}`);
  }
  if (anim.jsonUrl) {
    lines.push(`   JSON URL: ${anim.jsonUrl}`);
  }
  if (anim.gifUrl) {
    lines.push(`   Preview GIF: ${anim.gifUrl}`);
  }

  return lines.join("\n");
}

/**
 * Search for Lottie animations on LottieFiles.
 * 
 * This tool searches the LottieFiles public library (800,000+ free animations)
 * and returns direct download URLs for JSON and dotLottie formats.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "search_animations",
    "Search for free Lottie animations by keyword. Returns animations with direct download URLs (JSON and dotLottie formats). Perfect for finding loading spinners, success animations, icons, and more.",
    {
      query: z
        .string()
        .min(1)
        .max(100)
        .describe("Search keywords (e.g., 'loading spinner', 'success check', 'error', 'arrow')"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Number of results to return (1-50, default: 10)"),
    },
    async ({ query, limit = 10 }) => {
      log.info("Searching animations", { query, limit });

      try {
        const response = await fetch(LOTTIEFILES_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
          },
          body: JSON.stringify({
            query: SEARCH_QUERY,
            variables: { query, limit },
          }),
        });

        if (!response.ok) {
          log.error("API request failed", { status: response.status });
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to search animations: HTTP ${response.status}`,
              },
            ],
            isError: true,
          };
        }

        const result: SearchResponse = await response.json();

        if (result.errors && result.errors.length > 0) {
          log.error("GraphQL errors", { errors: result.errors });
          return {
            content: [
              {
                type: "text" as const,
                text: `Search failed: ${result.errors.map((e) => e.message).join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const searchData = result.data.searchPublicAnimations;
        const animations = searchData.edges.map((edge) => edge.node);

        if (animations.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No animations found for "${query}". Try different keywords like: loading, spinner, success, error, check, arrow, heart, star, confetti, rocket, etc.`,
              },
            ],
          };
        }

        // Format results
        const formattedAnimations = animations.map((anim, i) => formatAnimation(anim, i));

        const header = `Found ${searchData.totalCount.toLocaleString()} animations for "${query}" (showing ${animations.length}):\n`;
        const footer = `\n---\nTo download: Use the JSON URL or dotLottie URL directly.\nLicense: Lottie Simple License (free for commercial use, no attribution required)`;

        log.info("Search completed", {
          query,
          totalCount: searchData.totalCount,
          returned: animations.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: header + formattedAnimations.join("\n\n") + footer,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Search failed", { query, error: errorMessage });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to search animations: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
