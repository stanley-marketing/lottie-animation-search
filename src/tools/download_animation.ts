import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("download_animation");

/**
 * Maximum JSON size to return (to avoid overwhelming the context)
 */
const MAX_JSON_SIZE = 100000; // 100KB

/**
 * Download a Lottie animation JSON by its URL.
 * 
 * This tool fetches the actual animation JSON data so you can use it directly
 * in your application or save it to a file.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "download_animation",
    "Download a Lottie animation JSON by URL. Returns the actual JSON data that you can use directly in your app. For large animations, consider using the URL directly instead.",
    {
      url: z
        .string()
        .url()
        .describe("The animation JSON URL (from search results or get_animation)"),
      format: z
        .enum(["json", "minified"])
        .optional()
        .default("minified")
        .describe("Output format: 'json' (pretty-printed) or 'minified' (compact, default)"),
    },
    async ({ url, format = "minified" }) => {
      log.info("Downloading animation", { url, format });

      // Validate URL is from a trusted source
      const trustedDomains = [
        "lottie.host",
        "assets.lottiefiles.com",
        "assets1.lottiefiles.com",
        "assets2.lottiefiles.com",
        "assets3.lottiefiles.com",
        "assets4.lottiefiles.com",
        "assets5.lottiefiles.com",
        "assets6.lottiefiles.com",
        "assets7.lottiefiles.com",
        "assets8.lottiefiles.com",
        "assets9.lottiefiles.com",
        "assets10.lottiefiles.com",
      ];

      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        if (!trustedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
          log.warn("Untrusted domain", { url, hostname });
          return {
            content: [
              {
                type: "text" as const,
                text: `For security, only URLs from LottieFiles CDN are supported. Trusted domains: ${trustedDomains.slice(0, 3).join(", ")}...`,
              },
            ],
            isError: true,
          };
        }
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: "Invalid URL provided",
            },
          ],
          isError: true,
        };
      }

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "LottieAnimationSearch-MCP/1.0",
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          log.error("Download failed", { url, status: response.status });
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to download animation: HTTP ${response.status}`,
              },
            ],
            isError: true,
          };
        }

        const contentType = response.headers.get("content-type") || "";
        
        // Handle .lottie files (which are actually ZIP archives)
        if (url.endsWith(".lottie") || contentType.includes("application/zip")) {
          log.info("dotLottie format detected, providing guidance");
          return {
            content: [
              {
                type: "text" as const,
                text: `This is a dotLottie file (.lottie format), which is a compressed archive containing the animation.

To use it:
1. **In HTML with lottie-player:**
   \`\`\`html
   <script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
   <lottie-player src="${url}" background="transparent" speed="1" loop autoplay></lottie-player>
   \`\`\`

2. **In React:**
   \`\`\`jsx
   import { DotLottieReact } from '@lottiefiles/dotlottie-react';
   <DotLottieReact src="${url}" loop autoplay />
   \`\`\`

3. **For raw JSON:** Try searching for the same animation and look for the JSON URL instead of dotLottie URL.

The dotLottie format is more efficient (smaller file size) and is recommended for production use.`,
              },
            ],
          };
        }

        const text = await response.text();

        // Check size
        if (text.length > MAX_JSON_SIZE) {
          log.warn("Animation too large", { url, size: text.length });
          return {
            content: [
              {
                type: "text" as const,
                text: `Animation JSON is too large (${(text.length / 1024).toFixed(1)}KB). For large animations, use the URL directly in your app:

\`\`\`html
<lottie-player src="${url}" background="transparent" speed="1" loop autoplay></lottie-player>
\`\`\`

Or download it manually and save to a file.`,
              },
            ],
          };
        }

        // Parse and validate JSON
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          log.error("Invalid JSON", { url });
          return {
            content: [
              {
                type: "text" as const,
                text: "The downloaded content is not valid JSON",
              },
            ],
            isError: true,
          };
        }

        // Format output
        const output = format === "json" ? JSON.stringify(json, null, 2) : JSON.stringify(json);

        // Extract some metadata for context
        const lottieJson = json as Record<string, unknown>;
        const metadata: string[] = [];

        if (lottieJson.v) metadata.push(`Version: ${lottieJson.v}`);
        if (lottieJson.fr) metadata.push(`Frame Rate: ${lottieJson.fr}fps`);
        if (lottieJson.w && lottieJson.h) metadata.push(`Size: ${lottieJson.w}x${lottieJson.h}`);
        if (typeof lottieJson.ip === "number" && typeof lottieJson.op === "number" && typeof lottieJson.fr === "number") {
          const duration = ((lottieJson.op as number) - (lottieJson.ip as number)) / (lottieJson.fr as number);
          metadata.push(`Duration: ${duration.toFixed(2)}s`);
        }

        const header = `# Lottie Animation JSON

**Source:** ${url}
**Size:** ${(text.length / 1024).toFixed(1)}KB
${metadata.length > 0 ? `**Metadata:** ${metadata.join(" | ")}` : ""}

## JSON Data
\`\`\`json
`;

        const footer = `
\`\`\`

## Usage Example
\`\`\`html
<script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
<lottie-player 
  src='${url}' 
  background="transparent" 
  speed="1" 
  style="width: 300px; height: 300px;"
  loop 
  autoplay>
</lottie-player>
\`\`\``;

        log.info("Animation downloaded", { url, size: text.length });

        return {
          content: [
            {
              type: "text" as const,
              text: header + output + footer,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Download failed", { url, error: errorMessage });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to download animation: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
