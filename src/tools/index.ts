import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WrapToolFn } from "../types/tool.js";
import * as searchAnimations from "./search_animations.js";
import * as getAnimation from "./get_animation.js";
import * as listPopular from "./list_popular.js";
import * as downloadAnimation from "./download_animation.js";
import * as findSimilar from "./find_similar.js";
import * as searchByTags from "./search_by_tags.js";
import * as manageStyles from "./manage_styles.js";
import * as searchWithStyle from "./search_with_style.js";

/**
 * All tool modules to register.
 *
 * Tools available:
 * - search_animations: Search for Lottie animations by keyword
 * - get_animation: Get detailed info about a specific animation
 * - list_popular: List trending/popular animations
 * - download_animation: Download animation JSON content
 * - find_similar: Find animations similar to a given one (by tags)
 * - search_by_tags: Search by style tags (minimal, flat, 3d, etc.)
 * 
 * Style management tools:
 * - save_style: Save a named style preset with tags
 * - list_styles: List all saved styles
 * - delete_style: Delete a saved style
 * - set_folder_style: Associate a folder with a style
 * - remove_folder_style: Remove folder association
 * - get_folder_style: Get style for a folder (checks parents)
 * - search_with_style: Search using a saved style
 * - search_for_folder: Search using a folder's style
 *
 * Note: The built-in `report_issue` tool is automatically registered
 * when metrics are enabled. See src/metrics/report_issue_tool.ts
 */
const tools = [
  searchAnimations,
  getAnimation,
  listPopular,
  downloadAnimation,
  findSimilar,
  searchByTags,
  manageStyles,
  searchWithStyle,
];

/**
 * Registers all tools with the MCP server.
 *
 * @param server - The MCP server instance
 * @param wrapTool - Function to wrap tools with metrics (if enabled)
 */
export function registerTools(server: McpServer, wrapTool: WrapToolFn): void {
  for (const tool of tools) {
    tool.register(server, wrapTool);
  }
}
