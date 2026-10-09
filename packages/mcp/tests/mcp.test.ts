import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { isJsonValue } from "../../../apps/desktop/src/shared/json.ts";
import { configFor, saveParametersFor } from "../renderer/index.tsx";
import mcpExtension, {
  connectServer,
  loadMcpServers,
  mcpResultText,
  mcpToolName,
  removeMcpServer,
  saveMcpServer,
} from "../extensions/mcp.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "nativepi-mcp-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("new-server renderer parameters are valid JSON", () => {
  const parameters = saveParametersFor({
    scope: "project",
    name: "Context7",
    transport: "http",
    command: "",
    args: "",
    cwd: "",
    url: "https://example.com/mcp",
    metadata: "",
  }, {
    transport: "http",
    url: "https://example.com/mcp",
    headers: { Authorization: "Bearer test-token" },
  });

  expect(isJsonValue(parameters)).toBe(true);
});

test("empty optional renderer fields are valid JSON", () => {
  const drafts = [
    {
      scope: "project" as const,
      name: "Remote",
      transport: "http" as const,
      command: "",
      args: "",
      cwd: "",
      url: "https://example.com/mcp",
      metadata: "",
    },
    {
      scope: "project" as const,
      name: "Local",
      transport: "stdio" as const,
      command: "npx",
      args: "-y\nserver-package",
      cwd: "",
      url: "",
      metadata: "",
    },
  ];

  for (const draft of drafts) {
    expect(isJsonValue(saveParametersFor(draft, configFor(draft)))).toBe(true);
  }
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

test("graphical edits preserve unrelated configuration and reconnectable server fields", async () => {
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();
  const path = join(agentDir, "mcp.json");
  await writeFile(path, JSON.stringify({
    customTopLevel: true,
    mcpServers: {
      oldName: { command: "old", customServerField: 42 },
      untouched: { url: "https://example.com/mcp" },
    },
  }));

  await saveMcpServer(project, true, {
    scope: "user",
    originalName: "oldName",
    name: "renamed",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "server-package"],
      env: { TOKEN: "secret" },
      cwd: "tools",
    },
  }, agentDir);

  const saved = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  expect(saved).toMatchObject({
    customTopLevel: true,
    mcpServers: {
      renamed: {
        command: "npx",
        args: ["-y", "server-package"],
        env: { TOKEN: "secret" },
        cwd: "tools",
        customServerField: 42,
      },
      untouched: { url: "https://example.com/mcp" },
    },
  });
  expect((saved.mcpServers as Record<string, unknown>).oldName).toBeUndefined();

  await expect(saveMcpServer(project, true, {
    scope: "user",
    name: "renamed",
    config: { transport: "http", url: "https://replacement.example.com/mcp" },
  }, agentDir)).rejects.toThrow("already exists");

  await removeMcpServer(project, true, "user", "renamed", agentDir);
  const removed = JSON.parse(await readFile(path, "utf8")) as { mcpServers: Record<string, unknown> };
  expect(removed.mcpServers.renamed).toBeUndefined();
  expect(removed.mcpServers.untouched).toBeDefined();
});

test("graphical configuration refuses project changes before trust", async () => {
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();

  await expect(saveMcpServer(project, false, {
    scope: "project",
    name: "blocked",
    config: { transport: "http", url: "https://example.com/mcp" },
  }, agentDir)).rejects.toThrow("Trust this project");
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

test("Pi keeps structured MCP results and error context, and cancels pending connections on shutdown", async () => {
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();
  const fixture = fileURLToPath(new URL("./fixtures/echo-server.ts", import.meta.url));
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(project, ".pi", "mcp.json"), JSON.stringify({
    mcpServers: { echo: { command: process.execPath, args: [fixture] } },
  }));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const tools = new Map<string, ToolDefinition>();
  const handlers = new Map<string, (event: unknown, context: ExtensionContext) => Promise<void>>();
  let activeTools: string[] = [];
  const context = {
    cwd: project,
    isProjectTrusted: () => true,
    ui: { notify: () => {}, setStatus: () => {}, theme: { fg: (_color: string, text: string) => text } },
  } as unknown as ExtensionContext;
  mcpExtension({
    on: (event: string, handler: (event: unknown, context: ExtensionContext) => Promise<void>) => handlers.set(event, handler),
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    getAllTools: () => [],
    getActiveTools: () => activeTools,
    setActiveTools: (names: string[]) => { activeTools = names; },
  } as never);

  try {
    await handlers.get("session_start")?.({}, context);
    const echo = tools.get("mcp_echo_echo");
    const fail = tools.get("mcp_echo_fail");
    if (!echo || !fail) throw new Error("MCP fixture tools were not registered.");
    expect(echo.outputSchema).toBeDefined();
    expect(echo.annotations?.readOnlyHint).toBe(true);
    const result = await echo.execute("echo-1", { text: "hello" }, undefined, undefined, context as never);
    expect(result.structuredContent).toEqual({ echoed: "hello" });
    const failed = await fail.execute("fail-1", {}, undefined, undefined, context as never);
    expect(failed.isError).toBe(true);
    expect(failed.content).toContainEqual({ type: "text", text: expect.stringContaining("could not finish") });
    expect(failed.details).toMatchObject({ server: "echo", tool: "fail" });
    expect(failed.structuredContent).toEqual({ reason: "fixture failure" });

    await writeFile(join(project, ".pi", "mcp.json"), JSON.stringify({
      mcpServers: { silent: { command: process.execPath, args: ["-e", "process.stdin.resume()"] } },
    }));
    const restarting = handlers.get("session_start")!({}, context);
    const settled = restarting.then(() => undefined, (error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await handlers.get("session_shutdown")!({}, context);
    expect(await settled).toMatchObject({ message: expect.stringContaining("session changed") });
    expect(activeTools).toEqual([]);
  } finally {
    await handlers.get("session_shutdown")?.({}, context);
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
});
