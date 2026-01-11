import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";
import { getStyleTags, getStyleForFolder } from "../config/styles.js";

const log = createLogger("search_with_style");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for searching animations
 */
const SEARCH_QUERY = `
  query SearchWithStyle($query: String!, $limit: Int!) {
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
 * Search animations using style tags
 */
async function searchWithTags(
  styleName: string,
  tags: string[],
  keyword: string | undefined,
  limit: number
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
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
        text: `No animations found matching style "${styleName}" (tags: ${tags.join(", ")})${keyword ? ` with keyword "${keyword}"` : ""}\n\nTry:\n- Using different tags in the style\n- Removing the keyword filter\n- Searching with fewer tags`,
      }],
    };
  }

  // Format results
  const lines: string[] = [
    `# Animations matching style: "${styleName}"`,
    "",
    `**Style tags:** ${tags.join(", ")}`,
    keyword ? `**Keyword filter:** "${keyword}"` : "",
    "",
    `Found ${animations.length} animations:`,
    "",
  ].filter(Boolean);

  animations.forEach((anim, index) => {
    lines.push(`## ${index + 1}. ${anim.name}`);
    lines.push(`**ID:** ${anim.id}`);
    
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

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

/**
 * Register style-based search tools
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  // ==================== SEARCH WITH STYLE ====================
  const searchWithStyleTool = wrapTool(
    "search_with_style",
    "Search for Lottie animations using a saved style preset. Uses the style's tags to find matching animations.",
    {
      style: z
        .string()
        .min(1)
        .describe("Name of the saved style to use (see list_styles for available styles)"),
      keyword: z
        .string()
        .optional()
        .describe("Optional keyword to combine with style tags (e.g., 'loading' to find minimal loading animations)"),
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
        .describe("If true, only return animations that have at least one of the style's tags"),
    },
    async ({ style, keyword, limit = 10 }) => {
      log.info("Searching with style", { style, keyword, limit });

      try {
        const tags = await getStyleTags(style);

        if (!tags) {
          return {
            content: [{
              type: "text" as const,
              text: `Style "${style}" not found.\n\nCreate it with:\n\`save_style(name: "${style}", tags: ["tag1", "tag2"])\`\n\nOr use \`list_styles\` to see available styles.`,
            }],
            isError: true,
          };
        }

        return await searchWithTags(style, tags, keyword, limit);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Style search failed", { style, error: errorMessage });

        return {
          content: [{ type: "text" as const, text: `Search failed: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== SEARCH FOR FOLDER ====================
  const searchForFolderTool = wrapTool(
    "search_for_folder",
    "Search for Lottie animations using a folder's associated style. The folder must have a style set via set_folder_style. Also checks parent folders for inherited styles.",
    {
      folder: z
        .string()
        .min(1)
        .describe("Folder path to get style from (e.g., 'src/components/buttons')"),
      keyword: z
        .string()
        .optional()
        .describe("Optional keyword to combine with the folder's style tags"),
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
        .describe("If true, only return animations that have at least one of the style's tags"),
    },
    async ({ folder, keyword, limit = 10 }) => {
      log.info("Searching for folder", { folder, keyword, limit });

      try {
        const result = await getStyleForFolder(folder);

        if (!result) {
          return {
            content: [{
              type: "text" as const,
              text: `No style found for folder "${folder}" or its parent folders.\n\nSet one with:\n1. First create a style: \`save_style(name: "my-style", tags: ["minimal", "flat"])\`\n2. Then associate it: \`set_folder_style(folder: "${folder}", style: "my-style")\``,
            }],
            isError: true,
          };
        }

        const { style: styleName, tags, matchedPath } = result;
        
        // Show inheritance info if style came from parent folder
        let prefix = "";
        if (matchedPath !== folder) {
          prefix = `*Style inherited from: \`${matchedPath}\`*\n\n`;
        }

        const searchResult = await searchWithTags(styleName, tags, keyword, limit);
        
        // Prepend inheritance info if applicable
        if (prefix && searchResult.content[0]?.type === "text") {
          searchResult.content[0].text = prefix + searchResult.content[0].text;
        }

        return searchResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Folder search failed", { folder, error: errorMessage });

        return {
          content: [{ type: "text" as const, text: `Search failed: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // Register tools
  server.tool(searchWithStyleTool.name, searchWithStyleTool.description, searchWithStyleTool.schema, searchWithStyleTool.handler);
  server.tool(searchForFolderTool.name, searchForFolderTool.description, searchForFolderTool.schema, searchForFolderTool.handler);
};
