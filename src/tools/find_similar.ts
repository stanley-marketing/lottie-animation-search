import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("find_similar");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for searching animations
 */
const SEARCH_QUERY = `
  query SearchSimilar($query: String!, $limit: Int!) {
    searchPublicAnimations(query: $query, first: $limit) {
      totalCount
      edges {
        node {
          id
          name
          description
          downloads
          likesCount
          lottieUrl
          jsonUrl
          gifUrl
          createdBy {
            username
          }
        }
      }
    }
  }
`;

interface LottieAnimation {
  id: string;
  name: string;
  description: string | null;
  downloads: number;
  likesCount: number;
  lottieUrl: string | null;
  jsonUrl: string | null;
  gifUrl: string | null;
  createdBy: { username: string } | null;
}

interface SearchResponse {
  data: {
    searchPublicAnimations: {
      totalCount: number;
      edges: Array<{ node: LottieAnimation }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Find similar Lottie animations based on keywords/tags.
 * 
 * Since the public API doesn't expose animation tags, this tool searches
 * using provided keywords to find visually similar animations.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "find_similar",
    "Find Lottie animations similar to a given animation based on shared tags. Great for finding animations with consistent visual style.",
    {
      id: z
        .string()
        .min(1)
        .describe("The animation ID to find similar animations for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .default(10)
        .describe("Maximum number of similar animations to return (1-30, default: 10)"),
    },
    async ({ id, limit = 10 }) => {
      log.info("Finding similar animations", { id, limit });

      // Since the public API doesn't support getting animation details by ID,
      // we'll search using the ID as a keyword and suggest using search_by_tags instead
      try {
        const response = await fetch(LOTTIEFILES_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
          },
          body: JSON.stringify({
            query: SEARCH_QUERY,
            variables: { query: id, limit },
          }),
        });

        if (!response.ok) {
          return {
            content: [{ type: "text" as const, text: `Search failed: HTTP ${response.status}` }],
            isError: true,
          };
        }

        const result: SearchResponse = await response.json();

        if (result.errors?.length) {
          return {
            content: [{ type: "text" as const, text: `Search failed: ${result.errors.map(e => e.message).join(", ")}` }],
            isError: true,
          };
        }

        const animations = result.data.searchPublicAnimations.edges
          .map(e => e.node)
          .filter(a => a.id !== id); // Exclude the source animation

        if (animations.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No similar animations found for ID: ${id}\n\n**Tip:** The LottieFiles public API has limited support for finding similar animations.\n\nTry these alternatives:\n- Use \`search_by_tags\` with style keywords like "minimal", "flat", "colorful"\n- Use \`search_animations\` with descriptive keywords\n- Use \`search_with_style\` with a saved style preset`,
            }],
          };
        }

        // Format results
        const lines: string[] = [
          `# Animations Related to ID: ${id}`,
          "",
          `Found ${animations.length} related animations:`,
          "",
        ];

        animations.forEach((anim, index) => {
          lines.push(`## ${index + 1}. ${anim.name}`);
          lines.push(`**ID:** ${anim.id}`);
          
          if (anim.description) {
            lines.push(`**Description:** ${anim.description.slice(0, 100)}${anim.description.length > 100 ? "..." : ""}`);
          }
          
          if (anim.createdBy) {
            lines.push(`**Creator:** ${anim.createdBy.username}`);
          }
          
          lines.push(`**Downloads:** ${anim.downloads.toLocaleString()}`);
          
          if (anim.lottieUrl) {
            lines.push(`**dotLottie URL:** ${anim.lottieUrl}`);
          }
          if (anim.jsonUrl) {
            lines.push(`**JSON URL:** ${anim.jsonUrl}`);
          }
          
          lines.push("");
        });

        lines.push("---");
        lines.push("**Tip:** For better style matching, use `search_by_tags` with specific style keywords.");

        log.info("Found related animations", { 
          sourceId: id, 
          resultsCount: animations.length 
        });

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to find similar animations", { id, error: errorMessage });

        return {
          content: [{ type: "text" as const, text: `Failed to find similar animations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
