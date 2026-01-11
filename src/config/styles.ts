import { promises as fs } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("styles-config");

/**
 * Style configuration structure
 */
export interface StyleConfig {
  styles: Record<string, string[]>; // name -> tags
  folders: Record<string, string>; // folder path -> style name
}

/**
 * Default empty config
 */
const DEFAULT_CONFIG: StyleConfig = {
  styles: {},
  folders: {},
};

/**
 * Global config path: ~/.mcp/lottie-styles.json
 */
const GLOBAL_CONFIG_PATH = join(homedir(), ".mcp", "lottie-styles.json");

/**
 * Project config filename (relative to project root)
 */
const PROJECT_CONFIG_FILENAME = ".mcpconfig/lottie-styles.json";

/**
 * Current working directory (project root)
 */
let projectRoot: string = process.cwd();

/**
 * Set the project root directory
 */
export function setProjectRoot(path: string): void {
  projectRoot = path;
  log.debug("Project root set", { path });
}

/**
 * Get project config path
 */
function getProjectConfigPath(): string {
  return join(projectRoot, PROJECT_CONFIG_FILENAME);
}

/**
 * Ensure directory exists
 */
async function ensureDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

/**
 * Read a config file, return default if not exists
 */
async function readConfigFile(path: string): Promise<StyleConfig> {
  try {
    const content = await fs.readFile(path, "utf-8");
    const parsed = JSON.parse(content);
    return {
      styles: parsed.styles || {},
      folders: parsed.folders || {},
    };
  } catch (error) {
    // File doesn't exist or is invalid
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write a config file
 */
async function writeConfigFile(path: string, config: StyleConfig): Promise<void> {
  await ensureDir(path);
  await fs.writeFile(path, JSON.stringify(config, null, 2), "utf-8");
  log.debug("Config written", { path });
}

/**
 * Read global config
 */
export async function readGlobalConfig(): Promise<StyleConfig> {
  return readConfigFile(GLOBAL_CONFIG_PATH);
}

/**
 * Write global config
 */
export async function writeGlobalConfig(config: StyleConfig): Promise<void> {
  return writeConfigFile(GLOBAL_CONFIG_PATH, config);
}

/**
 * Read project config
 */
export async function readProjectConfig(): Promise<StyleConfig> {
  return readConfigFile(getProjectConfigPath());
}

/**
 * Write project config
 */
export async function writeProjectConfig(config: StyleConfig): Promise<void> {
  return writeConfigFile(getProjectConfigPath(), config);
}

/**
 * Get merged config (project overrides global)
 */
export async function getMergedConfig(): Promise<StyleConfig & { _sources: { styles: Record<string, "global" | "project">; folders: Record<string, "global" | "project"> } }> {
  const global = await readGlobalConfig();
  const project = await readProjectConfig();

  // Track where each style/folder comes from
  const sources = {
    styles: {} as Record<string, "global" | "project">,
    folders: {} as Record<string, "global" | "project">,
  };

  // Mark global sources
  for (const name of Object.keys(global.styles)) {
    sources.styles[name] = "global";
  }
  for (const path of Object.keys(global.folders)) {
    sources.folders[path] = "global";
  }

  // Mark project sources (overrides)
  for (const name of Object.keys(project.styles)) {
    sources.styles[name] = "project";
  }
  for (const path of Object.keys(project.folders)) {
    sources.folders[path] = "project";
  }

  return {
    styles: { ...global.styles, ...project.styles },
    folders: { ...global.folders, ...project.folders },
    _sources: sources,
  };
}

/**
 * Save a style
 */
export async function saveStyle(
  name: string,
  tags: string[],
  scope: "global" | "project" = "project"
): Promise<void> {
  const config = scope === "global" 
    ? await readGlobalConfig() 
    : await readProjectConfig();
  
  config.styles[name] = tags;
  
  if (scope === "global") {
    await writeGlobalConfig(config);
  } else {
    await writeProjectConfig(config);
  }
  
  log.info("Style saved", { name, tags, scope });
}

/**
 * Delete a style
 */
export async function deleteStyle(
  name: string,
  scope: "global" | "project" = "project"
): Promise<boolean> {
  const config = scope === "global" 
    ? await readGlobalConfig() 
    : await readProjectConfig();
  
  if (!(name in config.styles)) {
    return false;
  }
  
  delete config.styles[name];
  
  // Also remove folder associations using this style
  for (const [folder, styleName] of Object.entries(config.folders)) {
    if (styleName === name) {
      delete config.folders[folder];
    }
  }
  
  if (scope === "global") {
    await writeGlobalConfig(config);
  } else {
    await writeProjectConfig(config);
  }
  
  log.info("Style deleted", { name, scope });
  return true;
}

/**
 * Set folder style association
 */
export async function setFolderStyle(
  folderPath: string,
  styleName: string,
  scope: "global" | "project" = "project"
): Promise<void> {
  const config = scope === "global" 
    ? await readGlobalConfig() 
    : await readProjectConfig();
  
  // Normalize path (remove trailing slash, etc.)
  const normalizedPath = folderPath.replace(/\/+$/, "");
  
  config.folders[normalizedPath] = styleName;
  
  if (scope === "global") {
    await writeGlobalConfig(config);
  } else {
    await writeProjectConfig(config);
  }
  
  log.info("Folder style set", { folder: normalizedPath, style: styleName, scope });
}

/**
 * Remove folder style association
 */
export async function removeFolderStyle(
  folderPath: string,
  scope: "global" | "project" = "project"
): Promise<boolean> {
  const config = scope === "global" 
    ? await readGlobalConfig() 
    : await readProjectConfig();
  
  const normalizedPath = folderPath.replace(/\/+$/, "");
  
  if (!(normalizedPath in config.folders)) {
    return false;
  }
  
  delete config.folders[normalizedPath];
  
  if (scope === "global") {
    await writeGlobalConfig(config);
  } else {
    await writeProjectConfig(config);
  }
  
  log.info("Folder style removed", { folder: normalizedPath, scope });
  return true;
}

/**
 * Get style for a folder path (checks parent paths too)
 */
export async function getStyleForFolder(folderPath: string): Promise<{ style: string; tags: string[]; matchedPath: string } | null> {
  const config = await getMergedConfig();
  const normalizedPath = folderPath.replace(/\/+$/, "");
  
  // Check exact match first
  if (normalizedPath in config.folders) {
    const styleName = config.folders[normalizedPath];
    const tags = config.styles[styleName];
    if (tags) {
      return { style: styleName, tags, matchedPath: normalizedPath };
    }
  }
  
  // Check parent paths
  const parts = normalizedPath.split("/");
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join("/");
    if (parentPath in config.folders) {
      const styleName = config.folders[parentPath];
      const tags = config.styles[styleName];
      if (tags) {
        return { style: styleName, tags, matchedPath: parentPath };
      }
    }
  }
  
  return null;
}

/**
 * Get tags for a style name
 */
export async function getStyleTags(styleName: string): Promise<string[] | null> {
  const config = await getMergedConfig();
  return config.styles[styleName] || null;
}
