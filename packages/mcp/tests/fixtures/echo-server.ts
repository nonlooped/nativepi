import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "nativepi-mcp-test", version: "1.0.0" });
server.registerTool(
  "echo",
  {
    description: "Echo text",
    inputSchema: { text: z.string() },
    outputSchema: { echoed: z.string() },
    annotations: { readOnlyHint: true },
  },
  ({ text }) => Promise.resolve({
    content: [{ type: "text", text: `echo: ${text}` }],
    structuredContent: { echoed: text },
  }),
);
server.registerTool(
  "fail",
  { description: "Return an error with its context", inputSchema: {} },
  () => Promise.resolve({
    content: [{ type: "text", text: "The echo server could not finish." }],
    structuredContent: { reason: "fixture failure" },
    isError: true,
  }),
);

await server.connect(new StdioServerTransport());
