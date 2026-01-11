import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";
import { createLogger } from "../utils/logger.js";
import {
  saveStyle,
  deleteStyle,
  setFolderStyle,
  removeFolderStyle,
  getMergedConfig,
  getStyleTags,
  getStyleForFolder,
} from "../config/styles.js";

const log = createLogger("manage_styles");

/**
 * Common style tag suggestions
 */
const STYLE_SUGGESTIONS = {
  visual: ["minimal", "flat", "3d", "isometric", "outline", "filled", "gradient", "neon"],
  color: ["colorful", "monochrome", "pastel", "vibrant", "dark", "light"],
  type: ["icon", "illustration", "character", "logo", "ui", "button", "loader", "spinner"],
  mood: ["cute", "professional", "playful", "elegant", "fun"],
};

/**
 * Register all style management tools
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  // ==================== SAVE STYLE ====================
  const saveStyleTool = wrapTool(
    "save_style",
    "Save a named style preset with specific tags. Styles can be saved globally (all projects) or per-project.",
    {
      name: z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-_]+$/i, "Style name must be alphanumeric with dashes/underscores")
        .describe("Name for the style (e.g., 'minimal-ui', 'playful-icons')"),
      tags: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("Tags that define this style (e.g., ['minimal', 'flat', 'ui'])"),
      scope: z
        .enum(["project", "global"])
        .optional()
        .default("project")
        .describe("Where to save: 'project' (.mcpconfig/) or 'global' (~/.mcp/)"),
    },
    async ({ name, tags, scope = "project" }) => {
      log.info("Saving style", { name, tags, scope });

      try {
        await saveStyle(name, tags, scope);

        const location = scope === "global" 
          ? "~/.mcp/lottie-styles.json" 
          : ".mcpconfig/lottie-styles.json";

        return {
          content: [{
            type: "text" as const,
            text: `Style "${name}" saved successfully!\n\n**Tags:** ${tags.join(", ")}\n**Location:** ${location}\n**Scope:** ${scope}\n\nYou can now:\n- Use \`search_with_style(style: "${name}")\` to find matching animations\n- Use \`set_folder_style(folder: "/path", style: "${name}")\` to associate a folder`,
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to save style", { name, error: msg });
        return {
          content: [{ type: "text" as const, text: `Failed to save style: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== LIST STYLES ====================
  const listStylesTool = wrapTool(
    "list_styles",
    "List all saved style presets and folder associations. Shows both global and project styles.",
    {},
    async () => {
      log.info("Listing styles");

      try {
        const config = await getMergedConfig();
        const styleCount = Object.keys(config.styles).length;
        const folderCount = Object.keys(config.folders).length;

        if (styleCount === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No styles saved yet.\n\n**Create a style with:**\n\`save_style(name: "my-style", tags: ["minimal", "flat"])\`\n\n**Suggested tags:**\n- Visual: ${STYLE_SUGGESTIONS.visual.join(", ")}\n- Color: ${STYLE_SUGGESTIONS.color.join(", ")}\n- Type: ${STYLE_SUGGESTIONS.type.join(", ")}\n- Mood: ${STYLE_SUGGESTIONS.mood.join(", ")}`,
            }],
          };
        }

        const lines: string[] = [
          "# Saved Styles",
          "",
          `**${styleCount} styles** | **${folderCount} folder associations**`,
          "",
          "## Styles",
          "",
        ];

        for (const [name, tags] of Object.entries(config.styles)) {
          const source = config._sources.styles[name];
          const sourceIcon = source === "global" ? "🌐" : "📁";
          lines.push(`### ${sourceIcon} ${name}`);
          lines.push(`Tags: ${tags.join(", ")}`);
          lines.push(`Source: ${source}`);
          lines.push("");
        }

        if (folderCount > 0) {
          lines.push("## Folder Associations");
          lines.push("");
          
          for (const [folder, styleName] of Object.entries(config.folders)) {
            const source = config._sources.folders[folder];
            const sourceIcon = source === "global" ? "🌐" : "📁";
            lines.push(`- ${sourceIcon} \`${folder}\` → **${styleName}**`);
          }
          lines.push("");
        }

        lines.push("---");
        lines.push("🌐 = global (~/.mcp/) | 📁 = project (.mcpconfig/)");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to list styles", { error: msg });
        return {
          content: [{ type: "text" as const, text: `Failed to list styles: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== DELETE STYLE ====================
  const deleteStyleTool = wrapTool(
    "delete_style",
    "Delete a saved style preset. Also removes any folder associations using this style.",
    {
      name: z.string().min(1).describe("Name of the style to delete"),
      scope: z
        .enum(["project", "global"])
        .optional()
        .default("project")
        .describe("Where to delete from: 'project' or 'global'"),
    },
    async ({ name, scope = "project" }) => {
      log.info("Deleting style", { name, scope });

      try {
        const deleted = await deleteStyle(name, scope);

        if (!deleted) {
          return {
            content: [{
              type: "text" as const,
              text: `Style "${name}" not found in ${scope} config.`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `Style "${name}" deleted from ${scope} config.\nAny folder associations using this style have also been removed.`,
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to delete style", { name, error: msg });
        return {
          content: [{ type: "text" as const, text: `Failed to delete style: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== SET FOLDER STYLE ====================
  const setFolderStyleTool = wrapTool(
    "set_folder_style",
    "Associate a folder path with a style. When searching, you can reference this folder to use its style.",
    {
      folder: z
        .string()
        .min(1)
        .describe("Folder path (e.g., '/src/components/buttons' or 'src/pages/success')"),
      style: z
        .string()
        .min(1)
        .describe("Name of the style to associate (must be previously saved)"),
      scope: z
        .enum(["project", "global"])
        .optional()
        .default("project")
        .describe("Where to save the association"),
    },
    async ({ folder, style, scope = "project" }) => {
      log.info("Setting folder style", { folder, style, scope });

      try {
        // Verify style exists
        const tags = await getStyleTags(style);
        if (!tags) {
          return {
            content: [{
              type: "text" as const,
              text: `Style "${style}" not found. Create it first with:\n\`save_style(name: "${style}", tags: ["tag1", "tag2"])\``,
            }],
            isError: true,
          };
        }

        await setFolderStyle(folder, style, scope);

        return {
          content: [{
            type: "text" as const,
            text: `Folder style set!\n\n**Folder:** \`${folder}\`\n**Style:** ${style}\n**Tags:** ${tags.join(", ")}\n\nNow use \`search_for_folder(folder: "${folder}")\` to find matching animations.`,
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to set folder style", { folder, style, error: msg });
        return {
          content: [{ type: "text" as const, text: `Failed to set folder style: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== REMOVE FOLDER STYLE ====================
  const removeFolderStyleTool = wrapTool(
    "remove_folder_style",
    "Remove a folder's style association.",
    {
      folder: z.string().min(1).describe("Folder path to remove association from"),
      scope: z
        .enum(["project", "global"])
        .optional()
        .default("project")
        .describe("Where to remove from"),
    },
    async ({ folder, scope = "project" }) => {
      log.info("Removing folder style", { folder, scope });

      try {
        const removed = await removeFolderStyle(folder, scope);

        if (!removed) {
          return {
            content: [{
              type: "text" as const,
              text: `Folder "${folder}" has no style association in ${scope} config.`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `Folder style association removed for "${folder}".`,
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to remove folder style", { folder, error: msg });
        return {
          content: [{ type: "text" as const, text: `Failed to remove folder style: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== GET FOLDER STYLE ====================
  const getFolderStyleTool = wrapTool(
    "get_folder_style",
    "Get the style associated with a folder path. Also checks parent folders.",
    {
      folder: z.string().min(1).describe("Folder path to check"),
    },
    async ({ folder }) => {
      log.info("Getting folder style", { folder });

      try {
        const result = await getStyleForFolder(folder);

        if (!result) {
          return {
            content: [{
              type: "text" as const,
              text: `No style found for "${folder}" or its parent folders.\n\nSet one with:\n\`set_folder_style(folder: "${folder}", style: "style-name")\``,
            }],
          };
        }

        const lines = [
          `# Style for ${folder}`,
          "",
          `**Style:** ${result.style}`,
          `**Tags:** ${result.tags.join(", ")}`,
        ];

        if (result.matchedPath !== folder) {
          lines.push(`**Inherited from:** \`${result.matchedPath}\``);
        }

        lines.push("");
        lines.push(`Use \`search_for_folder(folder: "${folder}")\` to find matching animations.`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log.error("Failed to get folder style", { folder, error: msg });
        return {
          content: [{ type: "text" as const, text: `Failed to get folder style: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // Register all tools
  server.tool(saveStyleTool.name, saveStyleTool.description, saveStyleTool.schema, saveStyleTool.handler);
  server.tool(listStylesTool.name, listStylesTool.description, listStylesTool.schema, listStylesTool.handler);
  server.tool(deleteStyleTool.name, deleteStyleTool.description, deleteStyleTool.schema, deleteStyleTool.handler);
  server.tool(setFolderStyleTool.name, setFolderStyleTool.description, setFolderStyleTool.schema, setFolderStyleTool.handler);
  server.tool(removeFolderStyleTool.name, removeFolderStyleTool.description, removeFolderStyleTool.schema, removeFolderStyleTool.handler);
  server.tool(getFolderStyleTool.name, getFolderStyleTool.description, getFolderStyleTool.schema, getFolderStyleTool.handler);
};
