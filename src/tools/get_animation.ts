import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("get_animation");

/**
 * LottieFiles GraphQL API endpoint
 */
const LOTTIEFILES_API = "https://graphql.lottiefiles.com/2022-08";

/**
 * GraphQL query for getting animation details by ID
 */
const GET_ANIMATION_QUERY = `
  query GetAnimation($id: ID!) {
    animationByHashId(hashId: $id) {
      id
      hashId
      slug
      name
      description
      likesCount
      downloads
      gifUrl
      lottieUrl
      jsonUrl
      createdAt
      updatedAt
      bgColor
      speed
      createdBy {
        username
        avatarUrl
      }
      tags {
        name
      }
    }
  }
`;

interface AnimationDetails {
  id: string;
  hashId: string;
  slug: string;
  name: string;
  description: string | null;
  likesCount: number;
  downloads: number;
  gifUrl: string | null;
  lottieUrl: string | null;
  jsonUrl: string | null;
  createdAt: string;
  updatedAt: string;
  bgColor: string | null;
  speed: number | null;
  createdBy: {
    username: string;
    avatarUrl: string | null;
  } | null;
  tags: Array<{ name: string }> | null;
}

interface GetAnimationResponse {
  data: {
    animationByHashId: AnimationDetails | null;
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
        const response = await fetch(LOTTIEFILES_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
          },
          body: JSON.stringify({
            query: GET_ANIMATION_QUERY,
            variables: { id },
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

        const result: GetAnimationResponse = await response.json();

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

        const anim = result.data.animationByHashId;

        if (!anim) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Animation not found with ID: ${id}`,
              },
            ],
            isError: true,
          };
        }

        // Format detailed output
        const lines: string[] = [
          `# ${anim.name}`,
          "",
          `**ID:** ${anim.hashId || anim.id}`,
        ];

        if (anim.description) {
          lines.push(`**Description:** ${anim.description}`);
        }

        if (anim.createdBy) {
          lines.push(`**Creator:** ${anim.createdBy.username}`);
        }

        if (anim.tags && anim.tags.length > 0) {
          lines.push("");
          lines.push("## Style Tags");
          lines.push(anim.tags.map((t) => `\`${t.name}\``).join(" "));
          lines.push("");
          lines.push(`*Tip: Use \`find_similar\` with this ID to find animations with matching tags*`);
        }

        lines.push("");
        lines.push("## Stats");
        lines.push(`- Downloads: ${anim.downloads.toLocaleString()}`);
        lines.push(`- Likes: ${anim.likesCount.toLocaleString()}`);
        lines.push(`- Created: ${new Date(anim.createdAt).toLocaleDateString()}`);

        if (anim.bgColor) {
          lines.push(`- Background Color: ${anim.bgColor}`);
        }
        if (anim.speed) {
          lines.push(`- Speed: ${anim.speed}x`);
        }

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

        log.info("Animation details retrieved", { id: anim.hashId, name: anim.name });

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
