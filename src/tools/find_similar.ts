import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("find_similar");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for getting animation tags by ID
 */
const GET_TAGS_QUERY = `
  query GetAnimationTags($id: ID!) {
    animationByHashId(hashId: $id) {
      id
      name
      tags {
        name
      }
    }
  }
`;

/**
 * GraphQL query for searching animations by tag
 */
const SEARCH_BY_TAG_QUERY = `
  query SearchByTag($query: String!, $limit: Int!) {
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
          tags {
            name
          }
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
  tags: Array<{ name: string }> | null;
  createdBy: { username: string } | null;
}

interface GetTagsResponse {
  data: {
    animationByHashId: {
      id: string;
      name: string;
      tags: Array<{ name: string }> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
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
 * Calculate tag similarity score between two animations
 */
function calculateTagSimilarity(
  sourceTags: string[],
  targetTags: string[]
): number {
  if (sourceTags.length === 0 || targetTags.length === 0) return 0;
  
  const sourceSet = new Set(sourceTags.map(t => t.toLowerCase()));
  const targetSet = new Set(targetTags.map(t => t.toLowerCase()));
  
  let matchCount = 0;
  for (const tag of targetSet) {
    if (sourceSet.has(tag)) matchCount++;
  }
  
  // Jaccard similarity: intersection / union
  const union = new Set([...sourceSet, ...targetSet]);
  return matchCount / union.size;
}

/**
 * Find similar Lottie animations based on tags.
 * 
 * This tool finds animations with overlapping tags to help you
 * discover visually similar animations for consistent styling.
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

      try {
        // Step 1: Get tags from the source animation
        const tagsResponse = await fetch(LOTTIEFILES_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
          },
          body: JSON.stringify({
            query: GET_TAGS_QUERY,
            variables: { id },
          }),
        });

        if (!tagsResponse.ok) {
          return {
            content: [{ type: "text" as const, text: `Failed to get animation: HTTP ${tagsResponse.status}` }],
            isError: true,
          };
        }

        const tagsResult: GetTagsResponse = await tagsResponse.json();

        if (tagsResult.errors?.length) {
          return {
            content: [{ type: "text" as const, text: `Failed to get animation: ${tagsResult.errors.map(e => e.message).join(", ")}` }],
            isError: true,
          };
        }

        const sourceAnim = tagsResult.data.animationByHashId;
        if (!sourceAnim) {
          return {
            content: [{ type: "text" as const, text: `Animation not found with ID: ${id}` }],
            isError: true,
          };
        }

        const sourceTags = sourceAnim.tags?.map(t => t.name) || [];
        
        if (sourceTags.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `Animation "${sourceAnim.name}" has no tags. Cannot find similar animations based on tags.\n\nTry using search_animations with keywords from the animation name or description instead.`,
            }],
          };
        }

        log.info("Source animation tags", { name: sourceAnim.name, tags: sourceTags });

        // Step 2: Search for animations using the tags as search terms
        // We'll search for each tag and combine results
        const allResults: Map<string, { anim: LottieAnimation; score: number }> = new Map();

        // Search for animations matching the main tags (up to 3 most relevant)
        const searchTags = sourceTags.slice(0, 3);
        
        for (const tag of searchTags) {
          const searchResponse = await fetch(LOTTIEFILES_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "LottieAnimationSearch-MCP/1.0",
            },
            body: JSON.stringify({
              query: SEARCH_BY_TAG_QUERY,
              variables: { query: tag, limit: 20 },
            }),
          });

          if (searchResponse.ok) {
            const searchResult: SearchResponse = await searchResponse.json();
            if (!searchResult.errors) {
              for (const edge of searchResult.data.searchPublicAnimations.edges) {
                const anim = edge.node;
                // Skip the source animation
                if (anim.id === id || anim.id === sourceAnim.id) continue;
                
                const animTags = anim.tags?.map(t => t.name) || [];
                const score = calculateTagSimilarity(sourceTags, animTags);
                
                const existing = allResults.get(anim.id);
                if (!existing || score > existing.score) {
                  allResults.set(anim.id, { anim, score });
                }
              }
            }
          }
        }

        // Sort by similarity score and take top results
        const sortedResults = Array.from(allResults.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (sortedResults.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No similar animations found for "${sourceAnim.name}".\n\nTags searched: ${sourceTags.join(", ")}\n\nTry using search_animations with different keywords.`,
            }],
          };
        }

        // Format results
        const lines: string[] = [
          `# Similar Animations to "${sourceAnim.name}"`,
          "",
          `**Source Tags:** ${sourceTags.join(", ")}`,
          "",
          `Found ${sortedResults.length} similar animations:`,
          "",
        ];

        sortedResults.forEach((result, index) => {
          const { anim, score } = result;
          const animTags = anim.tags?.map(t => t.name) || [];
          const matchingTags = animTags.filter(t => 
            sourceTags.some(st => st.toLowerCase() === t.toLowerCase())
          );
          
          lines.push(`## ${index + 1}. ${anim.name}`);
          lines.push(`**ID:** ${anim.id}`);
          lines.push(`**Similarity:** ${Math.round(score * 100)}%`);
          lines.push(`**Matching Tags:** ${matchingTags.join(", ") || "none"}`);
          lines.push(`**All Tags:** ${animTags.join(", ") || "none"}`);
          
          if (anim.createdBy) {
            lines.push(`**Creator:** ${anim.createdBy.username}`);
          }
          
          lines.push(`**Downloads:** ${anim.downloads.toLocaleString()}`);
          
          if (anim.lottieUrl) {
            lines.push(`**URL:** ${anim.lottieUrl}`);
          } else if (anim.jsonUrl) {
            lines.push(`**URL:** ${anim.jsonUrl}`);
          }
          
          lines.push("");
        });

        lines.push("---");
        lines.push("**Tip:** Use `get_animation` with an ID to see full details, or `find_similar` again to explore related styles.");

        log.info("Found similar animations", { 
          sourceId: id, 
          sourceName: sourceAnim.name,
          resultsCount: sortedResults.length 
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
