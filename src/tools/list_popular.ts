import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("list_popular");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for fetching popular/featured animations
 */
const POPULAR_QUERY = `
  query PopularAnimations($limit: Int!) {
    featuredPublicAnimations(first: $limit) {
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

interface PopularResponse {
  data: {
    featuredPublicAnimations: {
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

  if (anim.lottieUrl) {
    lines.push(`   dotLottie URL: ${anim.lottieUrl}`);
  }
  if (anim.jsonUrl) {
    lines.push(`   JSON URL: ${anim.jsonUrl}`);
  }

  return lines.join("\n");
}

/**
 * List popular/featured Lottie animations from LottieFiles.
 * 
 * Great for discovering trending animations and getting inspiration.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "list_popular",
    "List popular and featured Lottie animations from LottieFiles. Great for discovering trending animations and finding inspiration.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Number of animations to return (1-50, default: 10)"),
    },
    async ({ limit = 10 }) => {
      log.info("Fetching popular animations", { limit });

      try {
        const response = await fetch(LOTTIEFILES_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
          },
          body: JSON.stringify({
            query: POPULAR_QUERY,
            variables: { limit },
          }),
        });

        if (!response.ok) {
          log.error("API request failed", { status: response.status });
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch popular animations: HTTP ${response.status}`,
              },
            ],
            isError: true,
          };
        }

        const result: PopularResponse = await response.json();

        if (result.errors && result.errors.length > 0) {
          log.error("GraphQL errors", { errors: result.errors });
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch popular animations: ${result.errors.map((e) => e.message).join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const popularData = result.data.featuredPublicAnimations;
        const animations = popularData.edges.map((edge) => edge.node);

        if (animations.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No popular animations available at the moment.",
              },
            ],
          };
        }

        // Format results
        const formattedAnimations = animations.map((anim, i) => formatAnimation(anim, i));

        const header = `Popular Lottie Animations (showing ${animations.length} of ${popularData.totalCount.toLocaleString()}):\n`;
        const footer = `\n---\nTo download: Use the JSON URL or dotLottie URL directly.\nLicense: Lottie Simple License (free for commercial use)`;

        log.info("Popular animations fetched", {
          totalCount: popularData.totalCount,
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
        log.error("Failed to fetch popular animations", { error: errorMessage });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch popular animations: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
