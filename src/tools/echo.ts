import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";

/**
 * Example tool: echoes back the input message.
 * Replace this with your actual tools.
 *
 * Tool registration pattern:
 * 1. Define the register function with ToolRegistrar type
 * 2. Use wrapTool to create the tool (adds metrics if enabled)
 * 3. Register the wrapped tool with server.tool()
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "echo",
    "Echoes back the provided message",
    {
      message: z.string().describe("Message to echo back"),
    },
    async ({ message }) => ({
      content: [{ type: "text" as const, text: `Echo: ${message}` }],
    })
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
