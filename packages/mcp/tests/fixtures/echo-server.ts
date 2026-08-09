import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "nativepi-mcp-test", version: "1.0.0" });
server.registerTool(
  "echo",
  {
    description: "Echo text",
    inputSchema: { text: z.string() },
  },
  ({ text }) => Promise.resolve({ content: [{ type: "text", text: `echo: ${text}` }] }),
);

await server.connect(new StdioServerTransport());
