import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { connectServer, loadMcpServers, mcpResultText, mcpToolName } from "../extensions/mcp.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "nativepi-mcp-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("trusted project servers override user servers by name", async () => {
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();
  await Bun.write(join(agentDir, "mcp.json"), JSON.stringify({
    mcpServers: {
      shared: { command: "user-command" },
      userOnly: { url: "https://example.com/mcp" },
    },
  }));
  await mkdir(join(project, ".pi"), { recursive: true });
  await Bun.write(join(project, ".pi", "mcp.json"), JSON.stringify({
    mcpServers: {
      shared: { command: "project-command" },
    },
  }));

  const loaded = await loadMcpServers(project, true, agentDir);

  expect(loaded.diagnostics).toEqual([]);
  expect(loaded.servers.get("shared")?.config).toMatchObject({ command: "project-command" });
  expect(loaded.servers.has("userOnly")).toBe(true);
});

test("untrusted project configuration is ignored", async () => {
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();
  await Bun.write(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: { safe: { command: "safe" } } }));
  await mkdir(join(project, ".pi"), { recursive: true });
  await Bun.write(join(project, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { unsafe: { command: "unsafe" } } }));

  const loaded = await loadMcpServers(project, false, agentDir);

  expect([...loaded.servers.keys()]).toEqual(["safe"]);
});

test("invalid configuration is reported without loading a partial file", async () => {
  const agentDir = await temporaryDirectory();
  await writeFile(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: { broken: { args: [] } } }));

  const loaded = await loadMcpServers(await temporaryDirectory(), false, agentDir);

  expect(loaded.servers.size).toBe(0);
  expect(loaded.diagnostics[0]).toContain("Invalid");
});

test("tool names are provider-safe and bounded", () => {
  const name = mcpToolName("My Server!", "A very long tool name ".repeat(8));

  expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
  expect(name.length).toBeLessThanOrEqual(64);
  expect(name.startsWith("mcp_my_server_")).toBe(true);
});

test("the official SDK connects to a stdio server and calls its tool", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/echo-server.ts", import.meta.url));
  const server = await connectServer("echo", {
    config: { command: process.execPath, args: [fixture] },
    configDir: dirname(fixture),
  });

  try {
    expect(server.tools.map((tool) => tool.name)).toContain("echo");
    const result = await server.client.callTool(
      { name: "echo", arguments: { text: "hello" } },
      CallToolResultSchema,
    );
    expect(result).toMatchObject({ content: [{ type: "text", text: "echo: hello" }] });
  } finally {
    await server.close();
  }
});

test("non-text MCP content is represented without embedding binary data", () => {
  const text = mcpResultText({
    content: [
      { type: "audio", data: "AAAA", mimeType: "audio/wav" },
      { type: "resource", resource: { uri: "file:///notes.txt", text: "hello" } },
    ],
    structuredContent: { ok: true },
  });

  expect(text).toContain("Audio content: audio/wav");
  expect(text).toContain("Resource file:///notes.txt\nhello");
  expect(text).toContain('"ok": true');
  expect(text).not.toContain("AAAA");
});
