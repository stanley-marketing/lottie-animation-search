import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("get_animation");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for searching animations by ID
 */
const SEARCH_QUERY = `
  query SearchById($query: String!, $limit: Int!) {
    searchPublicAnimations(query: $query, first: $limit) {
      edges {
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

interface AnimationDetails {
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
      edges: Array<{ node: AnimationDetails }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Get detailed information about a specific Lottie animation by ID.
 * 
 * Returns comprehensive metadata and all available download URLs.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "get_animation",
    "Get detailed information about a specific Lottie animation by its ID. Returns metadata, tags, and all download URLs (JSON, dotLottie, GIF preview).",
    {
      id: z
        .string()
        .min(1)
        .describe("The animation ID (from search results)"),
    },
    async ({ id }) => {
      log.info("Getting animation details", { id });

      try {
        // Search for the animation using its ID
        const response = await fetch(LOTTIEFILES_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
          },
          body: JSON.stringify({
            query: SEARCH_QUERY,
            variables: { query: id, limit: 10 },
          }),
        });

        if (!response.ok) {
          log.error("API request failed", { status: response.status });
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to get animation: HTTP ${response.status}`,
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
                text: `Failed to get animation: ${result.errors.map((e) => e.message).join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        // Find the exact animation by ID
        const anim = result.data.searchPublicAnimations.edges
          .map(e => e.node)
          .find(a => a.id === id || a.id.toString() === id);

        if (!anim) {
          // If not found by exact ID, return the first result as a suggestion
          const firstResult = result.data.searchPublicAnimations.edges[0]?.node;
          if (firstResult) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Animation with exact ID "${id}" not found.\n\n**Did you mean "${firstResult.name}" (ID: ${firstResult.id})?**\n\nUse the ID from search results for best results.`,
                },
              ],
              isError: true,
            };
          }
          
          return {
            content: [
              {
                type: "text" as const,
                text: `Animation not found with ID: ${id}\n\nUse search_animations to find animations first.`,
              },
            ],
            isError: true,
          };
        }

        // Format detailed output
        const lines: string[] = [
          `# ${anim.name}`,
          "",
          `**ID:** ${anim.id}`,
        ];

        if (anim.description) {
          lines.push(`**Description:** ${anim.description}`);
        }

        if (anim.createdBy) {
          lines.push(`**Creator:** ${anim.createdBy.username}`);
        }

        lines.push("");
        lines.push("## Stats");
        lines.push(`- Downloads: ${anim.downloads.toLocaleString()}`);
        lines.push(`- Likes: ${anim.likesCount.toLocaleString()}`);
        lines.push(`- Created: ${new Date(anim.createdAt).toLocaleDateString()}`);

        lines.push("");
        lines.push("## Download URLs");

        if (anim.lottieUrl) {
          lines.push(`**dotLottie (recommended):** ${anim.lottieUrl}`);
        }
        if (anim.jsonUrl) {
          lines.push(`**JSON:** ${anim.jsonUrl}`);
        }
        if (anim.gifUrl) {
          lines.push(`**GIF Preview:** ${anim.gifUrl}`);
        }

        lines.push("");
        lines.push("## Usage");
        lines.push("```html");
        lines.push(`<script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>`);
        lines.push(`<lottie-player src="${anim.lottieUrl || anim.jsonUrl}" background="transparent" speed="1" loop autoplay></lottie-player>`);
        lines.push("```");

        lines.push("");
        lines.push("---");
        lines.push("**License:** Lottie Simple License (free for commercial use, no attribution required)");

        log.info("Animation details retrieved", { id: anim.id, name: anim.name });

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to get animation", { id, error: errorMessage });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get animation: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
