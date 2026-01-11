# MCP Server Template

A minimal, modular template for building MCP (Model Context Protocol) servers in TypeScript.

## Quick Start

```bash
# Install dependencies
npm install

# Development with hot reload
npm run dev

# Build
npm run build

# Run built server
npm start
```

## Structure

```
src/
├── index.ts          # Entry point - connects transport
├── server.ts         # Server factory - creates McpServer
├── tools/
│   ├── index.ts      # Tool registry
│   └── echo.ts       # Example tool
└── types/
    └── tool.ts       # Shared types
```

## Adding Tools

1. Create a file in `src/tools/`:

```typescript
// src/tools/my-tool.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function register(server: McpServer): void {
  server.tool(
    "my_tool",
    "Description of what this tool does",
    {
      param: z.string().describe("Parameter description"),
    },
    async ({ param }) => ({
      content: [{ type: "text", text: `Result: ${param}` }],
    })
  );
}
```

2. Register it in `src/tools/index.ts`:

```typescript
import * as myTool from "./my-tool.js";

const tools = [echo, myTool];
```

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```
