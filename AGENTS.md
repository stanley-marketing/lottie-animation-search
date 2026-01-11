# Agent Guidelines

## Overview
This is a **Model Context Protocol (MCP)** server template built with TypeScript. MCP enables AI applications to securely connect to external data sources and tools via a standardized protocol.

## Tech Stack
- **Runtime:** Node.js 18+ with ESM modules
- **Language:** TypeScript 5.x (strict mode)
- **MCP SDK:** `@modelcontextprotocol/sdk` - official TypeScript SDK
- **Validation:** `zod` - runtime schema validation for tool parameters
- **Dev Server:** `tsx` - TypeScript execution with watch mode
- **Testing:** `vitest` - fast, TypeScript-native test runner

## Commands
- **Build:** `npm run build` - compiles to `dist/`
- **Dev (watch):** `npm run dev` - runs with hot reload
- **Run:** `npm start` - runs compiled server
- **Test:** `npm test` - runs all tests once
- **Test (watch):** `npm run test:watch` - runs tests in watch mode
- **Test (unit only):** `npm run test:unit` - runs unit tests only
- **Test (integration only):** `npm run test:integration` - runs integration tests only
- **Test (coverage):** `npm run test:coverage` - runs tests with coverage report

## Getting Started

When you clone this template, the first thing you should do is configure `src/config.ts`:

```typescript
export const CONFIG = {
  serverName: "my-mcp-server",      // Your server name
  serverVersion: "1.0.0",            // Your server version
  metricsEnabled: true,              // Enable/disable metrics collection
  metricsMaxSizeBytes: 1024 * 1024,  // Max metrics file size (1MB)
} as const;
```

### Metrics System

This template includes an **optional metrics system** that tracks tool usage analytics. When enabled:

1. **All tools require a `reasoning` parameter** - callers must explain why they're using each tool
2. **Usage data is saved** to `~/.mcp-metrics/{serverName}.json`
3. **Tracked data includes:**
   - Tool name
   - Timestamp
   - Execution duration (ms)
   - Reasoning provided by caller
   - Input arguments
   - Full result or error message
   - Success/failure status

**To enable metrics:** Set `metricsEnabled: true` in `src/config.ts`

**To disable metrics:** Set `metricsEnabled: false` in `src/config.ts`

**Runtime override:** Use environment variable `MCP_METRICS_ENABLED=false` to temporarily disable metrics without changing config.

### Why Require Reasoning?

The `reasoning` parameter serves multiple purposes:
- **Usage analytics:** Understand how and why your tools are being used
- **Optimization insights:** Identify patterns and bottlenecks
- **Debugging:** Trace back why specific tool calls were made
- **Documentation:** Build a history of tool usage patterns

Example metrics output (`~/.mcp-metrics/my-mcp-server.json`):
```json
{
  "server_name": "my-mcp-server",
  "created_at": "2026-01-01T10:00:00.000Z",
  "updated_at": "2026-01-01T12:30:00.000Z",
  "total_invocations": 150,
  "tool_stats": {
    "echo": {
      "call_count": 50,
      "total_duration_ms": 750,
      "avg_duration_ms": 15,
      "success_count": 48,
      "error_count": 2,
      "last_used": "2026-01-01T12:30:00.000Z"
    }
  },
  "invocations": [
    {
      "tool": "echo",
      "timestamp": "2026-01-01T12:30:00.000Z",
      "duration_ms": 12,
      "reasoning": "Testing echo to verify server works",
      "arguments": { "message": "hello" },
      "success": true,
      "result": { "content": [{ "type": "text", "text": "Echo: hello" }] }
    }
  ]
}
```

### Built-in Issue Reporting

When metrics are enabled, a **`report_issue` tool** is automatically registered. This allows users to report bugs, feature requests, or other issues directly through the MCP interface.

**Features:**
- Issues are saved locally to `~/.mcp-metrics/{serverName}.issues.json`
- Supports multiple issue categories: `bug`, `feature_request`, `documentation`, `performance`, `security`, `other`
- Supports severity levels: `low`, `medium`, `high`, `critical`
- Optional fields for reproduction steps, expected/actual behavior, and environment details
- Maximum 100 issues stored (oldest are removed when limit is reached)

**Example usage:**
```typescript
await client.callTool({
  name: "report_issue",
  arguments: {
    title: "Server crashes when processing large files",
    description: "When uploading files larger than 10MB, the server crashes with an out-of-memory error.",
    severity: "high",
    category: "bug",
    steps_to_reproduce: "1. Upload a 15MB file\n2. Wait for processing\n3. Observe crash",
    expected_behavior: "File should be processed successfully",
    actual_behavior: "Server crashes with OOM error",
    environment: "Node.js 20, macOS 14, 8GB RAM",
    reasoning: "Reporting a critical production issue",
  },
});
```

**Example issues output (`~/.mcp-metrics/my-mcp-server.issues.json`):**
```json
{
  "server_name": "my-mcp-server",
  "created_at": "2026-01-01T10:00:00.000Z",
  "updated_at": "2026-01-01T14:30:00.000Z",
  "total_issues": 3,
  "issues": [
    {
      "id": "m1abc-xyz123",
      "title": "Server crashes when processing large files",
      "description": "When uploading files larger than 10MB...",
      "severity": "high",
      "category": "bug",
      "steps_to_reproduce": "1. Upload a 15MB file...",
      "expected_behavior": "File should be processed successfully",
      "actual_behavior": "Server crashes with OOM error",
      "environment": "Node.js 20, macOS 14, 8GB RAM",
      "created_at": "2026-01-01T14:30:00.000Z"
    }
  ]
}
```

This feature helps server maintainers collect feedback and track issues without requiring users to use external issue tracking systems.

## Publishing as npx Binary

MCP servers should be runnable via `npx` for easy installation and use. To enable this:

### 1. Add bin field to package.json
```json
{
  "name": "my-mcp-server",
  "bin": {
    "my-mcp-server": "./dist/index.js"
  }
}
```

### 2. Add shebang to entry point
The first line of `src/index.ts` must be:
```typescript
#!/usr/bin/env node
```

### 3. Build and publish
```bash
npm run build
npm publish
```

### 4. Users can then run
```bash
npx my-mcp-server
```

Or configure in their MCP client:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["my-mcp-server"]
    }
  }
}
```

## Architecture
```
src/
├── index.ts        # Entry point - stdio transport connection
├── server.ts       # Server factory - creates McpServer instance with metrics
├── config.ts       # Configuration - server name, metrics settings
├── metrics/        # Metrics and issue reporting system
│   ├── index.ts    # Public exports
│   ├── types.ts    # TypeScript interfaces for metrics and issues data
│   ├── collector.ts # MetricsCollector class with async write queue
│   ├── storage.ts  # File I/O and size enforcement
│   ├── issues.ts   # IssueCollector class for issue reporting
│   └── report_issue_tool.ts # Built-in report_issue tool
├── tools/          # Tool modules (one file per tool)
│   ├── index.ts    # Tool registry - imports and registers all tools
│   ├── wrapper.ts  # Tool wrapper for metrics (adds reasoning param)
│   ├── echo.ts     # Simple example tool
│   └── fetch_url.ts # Realistic example with async, errors, logging
└── utils/          # Utility modules
│   ├── index.ts    # Re-exports
│   ├── logger.ts   # Stderr-safe logging (won't break MCP protocol)
│   └── env.ts      # Environment variable helpers
└── types/          # Shared TypeScript types
    ├── index.ts    # Re-exports
    └── tool.ts     # ToolRegistrar, WrapToolFn types

tests/
├── helpers.ts      # Test utilities (createTestClient, extractTextContent)
├── unit/           # Unit tests - isolated tool/function testing
│   ├── echo.test.ts
│   ├── env.test.ts
│   ├── logger.test.ts
│   ├── metrics.test.ts
│   └── wrapper.test.ts
└── integration/    # Integration tests - full MCP request/response cycle
    └── server.test.ts
```

## Code Style
- **TypeScript strict mode** - explicit types required, no `any`
- **ESM modules** - use `.js` extension in imports (e.g., `./server.js`)
- **Imports order:** external packages first, then local modules
- **Naming:** camelCase for functions/variables, PascalCase for types/interfaces
- **Tool names:** snake_case (e.g., `my_tool`, `get_user`)

## Tool Design Philosophy

The goal is to create tools that feel **natural and intuitive** - like asking a helpful assistant, not like programming an API.

### Think Like the User

When an LLM sees your tool, it should immediately understand:
1. **What does this do?** (from the name)
2. **What do I need to provide?** (from parameter names)
3. **What will I get back?** (from the description)

### Naming Tools

**Use action + subject pattern:**
- `send_email` - clearly sends an email
- `create_task` - creates a task
- `search_documents` - searches through documents
- `get_weather` - gets weather information

**Avoid technical/generic names:**
- `execute_request` - what request? for what?
- `post_data` - HTTP method leaked into the name
- `run_action` - too vague
- `api_call` - implementation detail

### Naming Parameters

**Use everyday language:**
```typescript
// Good - feels like filling out a form
{
  recipient: z.string().describe("Who to send the email to"),
  subject: z.string().describe("Email subject line"),
  message: z.string().describe("The email content"),
}

// Bad - feels like writing code
{
  to_address: z.string().describe("RFC 5322 compliant email"),
  subject_line: z.string().describe("String, max 255 chars"),
  body_payload: z.string().describe("Request body content"),
}
```

### Writing Descriptions

**Describe the outcome, not the implementation:**
```typescript
// Good - explains what happens
"Sends an email to someone and confirms delivery"
"Creates a new task in your task list"
"Finds documents matching your search terms"

// Bad - explains how it works
"POSTs to /api/v1/email endpoint with JSON payload"
"Inserts a record into the tasks database table"
"Queries the Elasticsearch index with the provided terms"
```

**Parameter descriptions should guide, not constrain:**
```typescript
// Good - helpful guidance
recipient: z.string().describe("The person's email address, e.g. john@example.com")
priority: z.enum(["low", "medium", "high"]).describe("How urgent is this task?")
date: z.string().describe("When this should happen, like '2024-01-15' or 'tomorrow'")

// Bad - technical constraints
recipient: z.string().describe("Must be valid email format")
priority: z.enum(["low", "medium", "high"]).describe("Enum value, required field")
date: z.string().describe("ISO 8601 format required")
```

### Hide Complexity

**Handle implementation details internally:**
- Authentication - handle tokens/keys inside the tool
- Pagination - aggregate results automatically when possible
- IDs - accept human-readable names, resolve IDs internally
- Formats - accept flexible input, normalize internally

```typescript
// Good - simple interface, complexity hidden
const tool = wrapTool("get_user", "Gets information about a user", {
  name: z.string().describe("The user's name or email"),
}, async ({ name }) => {
  const user = await findUserByNameOrEmail(name);
  return { content: [{ type: "text", text: formatUser(user) }] };
});

// Bad - exposes internal IDs
const tool = wrapTool("get_user", "Gets user by ID", {
  user_id: z.string().describe("Internal user UUID"),
}, ...);
```

### One Tool, One Job

**Prefer focused tools over Swiss Army knives:**
```typescript
// Good - clear, focused tools
"send_email" - sends email
"list_emails" - lists received emails  
"search_emails" - finds specific emails

// Bad - one tool trying to do everything
"email_manager" with { action: "send" | "list" | "search" | "delete", ... }
```

### Return Readable Results

**Format output for humans, not machines:**
```typescript
// Good - easy to read and use
return {
  content: [{
    type: "text",
    text: `Created task "${title}" with ${priority} priority, due ${dueDate}`
  }]
};

// Bad - raw data dump
return {
  content: [{
    type: "text",
    text: JSON.stringify({ id: "abc123", created_at: "2024-01-15T...", ... })
  }]
};
```

## Tool Implementation Pattern

Each tool is a module in `src/tools/` using the `ToolRegistrar` pattern:

```typescript
import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";

/**
 * Example tool implementation.
 * The wrapTool function handles metrics collection if enabled.
 */
export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "send_greeting",                                    // action_subject name
    "Sends a friendly greeting to someone",             // outcome-focused description
    {
      name: z.string().describe("Who to greet"),        // simple, clear parameter
    },
    async ({ name }) => ({
      content: [{ type: "text" as const, text: `Hello, ${name}!` }],
    })
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
```

### Example: `fetch_url` Tool

See `src/tools/fetch_url.ts` for a realistic example that demonstrates:
- **Async operations** with proper error handling
- **Timeout handling** with AbortController
- **Using the logger** utility for debugging
- **Environment variable** configuration
- **Graceful error responses** with `isError: true`
- **Response size limits** to avoid overwhelming the LLM

```typescript
// Key patterns from fetch_url.ts:

// 1. Create a module-specific logger
const log = createLogger("fetch_url");

// 2. Use environment variables for configuration
const DEFAULT_TIMEOUT_MS = getEnvAsNumber("FETCH_TIMEOUT_MS", 10000);

// 3. Return isError: true for failures (instead of throwing)
return {
  content: [{ type: "text", text: `Request timed out after ${timeout}ms` }],
  isError: true,
};

// 4. Log at appropriate levels
log.debug("Fetching URL", { url, timeout });
log.warn("Fetch failed with HTTP error", { status: 404 });
log.error("Unexpected error", error);
```
```

### How It Works

1. **`wrapTool`** - A function passed to each tool's register function
   - When metrics are **enabled**: Adds a `reasoning` parameter and records usage
   - When metrics are **disabled**: Passes the tool through unchanged

2. **Register the tool** - After wrapping, register with `server.tool()`

3. **Add to registry** - Import your tool in `src/tools/index.ts`:
   ```typescript
   import * as myNewTool from "./my-new-tool.js";
   
   const tools = [echo, myNewTool];  // Add to array
   ```

### Creating a New Tool

1. Create `src/tools/my_tool.ts`:
```typescript
import { z } from "zod";
import { ToolRegistrar } from "../types/tool.js";

export const register: ToolRegistrar = (server, wrapTool) => {
  const tool = wrapTool(
    "my_tool",
    "Does something useful",
    {
      input: z.string().describe("The input to process"),
      count: z.number().optional().describe("How many times to process"),
    },
    async ({ input, count = 1 }) => {
      const result = processInput(input, count);
      return {
        content: [{ type: "text" as const, text: result }],
      };
    }
  );

  server.tool(tool.name, tool.description, tool.schema, tool.handler);
};
```

2. Register in `src/tools/index.ts`:
```typescript
import * as myTool from "./my_tool.js";

const tools = [echo, myTool];
```

## Utilities

### Logger (`src/utils/logger.ts`)

MCP servers use stdio for communication, so **never use `console.log()`** - it will break the protocol. Use the provided logger which safely writes to stderr:

```typescript
import { logger, createLogger } from "./utils/index.js";

// Basic logging
logger.info("Server started");
logger.debug("Processing request", { toolName: "echo" });
logger.warn("Rate limit approaching", { remaining: 10 });
logger.error("Failed to connect", new Error("Connection refused"));

// Create a prefixed logger for a specific module
const toolLogger = createLogger("my_tool");
toolLogger.info("Tool invoked");  // Output: [2026-01-01T12:00:00.000Z] INFO  [my_tool] Tool invoked
```

**Log levels** (set via `LOG_LEVEL` environment variable):
- `debug` - Verbose output for troubleshooting
- `info` - General operational messages (default)
- `warn` - Potentially problematic situations
- `error` - Failures and exceptions
- `silent` - No output

### Environment Variables (`src/utils/env.ts`)

Type-safe environment variable access with validation:

```typescript
import { 
  getRequiredEnv,
  getEnv,
  getOptionalEnv,
  getEnvAsNumber,
  getEnvAsBoolean,
  validateRequiredEnvVars,
} from "./utils/index.js";

// Required - throws if not set
const apiKey = getRequiredEnv("OPENAI_API_KEY");

// Optional with default
const timeout = getEnv("API_TIMEOUT", "30000");
const region = getEnv("AWS_REGION", "us-east-1");

// Optional, returns undefined if not set
const debugMode = getOptionalEnv("DEBUG");

// Typed parsing
const port = getEnvAsNumber("PORT", 3000);
const verbose = getEnvAsBoolean("VERBOSE", false);

// Validate multiple at startup (fail fast)
validateRequiredEnvVars([
  "OPENAI_API_KEY",
  "DATABASE_URL",
]);
```

**Extend `loadEnvConfig()`** in `src/utils/env.ts` to centralize your server's configuration:

```typescript
export function loadEnvConfig() {
  return {
    logLevel: getEnv("LOG_LEVEL", "info"),
    metricsEnabled: getEnvAsBoolean("MCP_METRICS_ENABLED", true),
    nodeEnv: getEnv("NODE_ENV", "development"),
    // Add your own:
    openaiApiKey: getRequiredEnv("OPENAI_API_KEY"),
    maxTokens: getEnvAsNumber("MAX_TOKENS", 4096),
  };
}
```

## Error Handling
- Use the `logger` utility for logging (never `console.log()` - breaks stdio transport)
- Wrap async entry points with `.catch()` and `process.exit(1)`
- Use `McpError` from SDK for tool-level errors
- Metrics failures are silent (logged to stderr, don't break tool execution)
- Return `isError: true` in tool results for graceful error reporting

## Zod Schemas
- Always add `.describe()` to schema fields - this provides context to LLMs
- Use specific types: `z.string().url()`, `z.number().int().min(0)`, etc.
- Mark optional params with `.optional()` or `.default(value)`

## Testing

### Blackbox Testing Approach

This project follows a **blackbox testing** methodology. Tests should verify external behavior (inputs → outputs) without depending on internal implementation details.

**Principles:**
- **Test the public interface** - Call tools via the MCP client and verify responses
- **Don't test internals** - Avoid testing private functions, internal state, or implementation details
- **Focus on behavior** - Test *what* the tool does, not *how* it does it
- **Use real inputs/outputs** - Test with realistic data that users would actually send

**Why blackbox testing?**
- Tests remain stable when refactoring internal code
- Tests document the expected behavior from a user's perspective
- Easier to write - no need to understand implementation details
- Catches regressions in actual user-facing functionality

**Do this:**
```typescript
// Test the tool's behavior through the MCP interface
const result = await ctx.client.callTool({
  name: "echo",
  arguments: { 
    message: "hello",
    reasoning: "Testing echo functionality",  // Required when metrics enabled
  },
});
expect(extractTextContent(result)).toBe("Echo: hello");
```

**Avoid this:**
```typescript
// Don't test internal functions directly
import { internalHelper } from "../../src/tools/echo.js";
expect(internalHelper("hello")).toBe("Echo: hello");
```

### Test Structure
- **Unit tests** (`tests/unit/`): Test individual functions and tool registration in isolation
- **Integration tests** (`tests/integration/`): Test full MCP request/response cycle via in-memory transport

### Test Helpers
Use the helpers from `tests/helpers.ts`:

```typescript
import { createTestClient, extractTextContent } from "../helpers.js";

// Integration test setup
const ctx = await createTestClient();  // Returns { server, client, metricsCollector, cleanup }
const result = await ctx.client.callTool({ 
  name: "my_tool", 
  arguments: { 
    param: "value",
    reasoning: "Testing the tool",  // Include when metrics enabled
  },
});
const text = extractTextContent(result);  // Extracts text from response
await ctx.cleanup();  // Always cleanup after tests
```

### Writing Tests
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestClient, extractTextContent, TestContext } from "../helpers.js";

describe("my_tool", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestClient();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("should do something", async () => {
    const result = await ctx.client.callTool({
      name: "my_tool",
      arguments: { 
        param: "value",
        reasoning: "Testing tool behavior",
      },
    });
    expect(extractTextContent(result)).toBe("expected output");
  });

  it("should record metrics when enabled", async () => {
    if (!ctx.metricsCollector) return;  // Skip if metrics disabled

    await ctx.client.callTool({
      name: "my_tool",
      arguments: { param: "value", reasoning: "Testing metrics" },
    });

    await new Promise(resolve => setTimeout(resolve, 50));  // Wait for async write
    
    const data = ctx.metricsCollector.getData();
    expect(data.total_invocations).toBeGreaterThan(0);
  });
});
```

### Testing Without Metrics

To run tests with metrics disabled:
```bash
MCP_METRICS_ENABLED=false npm test
```

This is useful for:
- Testing tools without the `reasoning` parameter requirement
- Faster test execution (no file I/O)
- Isolating tool logic from metrics logic
