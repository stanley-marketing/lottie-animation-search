import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, ServerContext } from "../src/server.js";
import { MetricsCollector, IssueCollector } from "../src/metrics/index.js";

/**
 * Test context containing both server and client for integration tests.
 */
export interface TestContext {
  server: McpServer;
  client: Client;
  metricsCollector: MetricsCollector | null;
  issueCollector: IssueCollector | null;
  cleanup: () => Promise<void>;
}

/**
 * Creates a test client connected to the MCP server via in-memory transport.
 * Use this for integration tests that need to test the full request/response cycle.
 *
 * Note: Tests run with metrics enabled by default (from config).
 * To test without metrics, set MCP_METRICS_ENABLED=false before running tests.
 */
export async function createTestClient(): Promise<TestContext> {
  const { server, metricsCollector, issueCollector } = await createServer();
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    server,
    client,
    metricsCollector,
    issueCollector,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

/**
 * Creates a standalone MCP server for unit testing tool registration.
 * Does not include transport - use for testing tool behavior in isolation.
 */
export async function createTestServer(): Promise<ServerContext> {
  return createServer();
}

/**
 * Helper to extract text content from MCP tool response.
 * Works with the return type of client.callTool()
 */
export function extractTextContent(
  result: Awaited<ReturnType<Client["callTool"]>>
): string {
  // Handle both old and new response formats
  const content = "content" in result ? result.content : [];
  if (!Array.isArray(content)) return "";
  
  const textContent = content.find(
    (c): c is { type: "text"; text: string } => 
      typeof c === "object" && c !== null && "type" in c && c.type === "text"
  );
  return textContent?.text ?? "";
}
