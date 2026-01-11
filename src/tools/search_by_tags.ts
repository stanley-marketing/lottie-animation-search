import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("search_by_tags");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for searching animations
 */
const SEARCH_QUERY = `
  query SearchByTags($query: String!, $limit: Int!) {
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

/**
 * Common style tags for reference
 */
const STYLE_TAGS = {
  visual: ["minimal", "flat", "3d", "isometric", "outline", "filled", "gradient", "neon", "retro", "modern"],
  color: ["colorful", "monochrome", "pastel", "vibrant", "dark", "light", "black", "white", "blue", "green", "red"],
  type: ["icon", "illustration", "character", "logo", "ui", "ux", "button", "loader", "spinner"],
  mood: ["cute", "professional", "playful", "elegant", "fun", "serious", "friendly"],
};

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
 * Search for Lottie animations by style tags.
 * 
 * This tool helps you find animations with specific visual styles
 * by searching for animations using style keywords.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "search_by_tags",
    "Search for Lottie animations by style tags (e.g., 'minimal', 'flat', '3d', 'colorful'). Great for finding animations with a specific visual style.",
    {
      tags: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe("Style tags to search for (e.g., ['minimal', 'flat'] or ['3d', 'colorful']). Common styles: minimal, flat, 3d, isometric, outline, colorful, monochrome, cute, professional"),
      keyword: z
        .string()
        .optional()
        .describe("Optional keyword to combine with tags (e.g., 'loading' to find minimal loading animations)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .default(10)
        .describe("Maximum number of results (1-30, default: 10)"),
      strict: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, only return animations that have at least one of the specified tags. If false, returns best matches."),
    },
    async ({ tags, keyword, limit = 10, strict = false }) => {
      log.info("Searching by tags", { tags, keyword, limit, strict });

      // Note: strict mode is ignored since API doesn't return tag metadata
      // We search using tags as keywords instead

      try {
        // Build search query combining tags and optional keyword
        const searchTerms = [...tags];
        if (keyword) {
          searchTerms.push(keyword);
        }
        const query = searchTerms.join(" ");

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

        const animations = result.data.searchPublicAnimations.edges.map(e => e.node);

        if (animations.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No animations found matching tags: ${tags.join(", ")}${keyword ? ` with keyword "${keyword}"` : ""}\n\n**Popular style tags to try:**\n- Visual: ${STYLE_TAGS.visual.join(", ")}\n- Color: ${STYLE_TAGS.color.join(", ")}\n- Type: ${STYLE_TAGS.type.join(", ")}\n- Mood: ${STYLE_TAGS.mood.join(", ")}`,
            }],
          };
        }

        // Format results
        const lines: string[] = [
          `# Animations matching style: ${tags.join(" + ")}${keyword ? ` + "${keyword}"` : ""}`,
          "",
          `Found ${animations.length} animations:`,
          "",
        ];

        animations.forEach((anim, index) => {
          lines.push(`## ${index + 1}. ${anim.name}`);
          lines.push(`**ID:** ${anim.id}`);
          lines.push(`**Search tags:** ${tags.join(", ")}`);
          
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
        lines.push("**Popular Style Tags:**");
        lines.push(`- Visual: ${STYLE_TAGS.visual.join(", ")}`);
        lines.push(`- Color: ${STYLE_TAGS.color.join(", ")}`);
        lines.push(`- Type: ${STYLE_TAGS.type.join(", ")}`);

        log.info("Tag search completed", { 
          tags,
          keyword,
          resultsCount: animations.length 
        });

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Tag search failed", { tags, error: errorMessage });

        return {
          content: [{ type: "text" as const, text: `Search failed: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
