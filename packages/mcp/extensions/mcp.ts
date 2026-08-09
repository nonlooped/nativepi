import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  CONFIG_DIR_NAME,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  getAgentDir,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { z } from "zod";

const CONNECT_TIMEOUT_MS = 15_000;
const MCP_OUTPUT_DIR = join(tmpdir(), "nativepi-mcp");

const stringMapSchema = z.record(
  z.string(),
  z.string().refine((value) => !/[\r\n]/.test(value), {
    message: "Header/env values must not contain CR or LF",
  }),
);
const stdioServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: stringMapSchema.optional(),
  cwd: z.string().min(1).optional(),
  url: z.never().optional(),
  headers: z.never().optional(),
}).passthrough();
const httpServerSchema = z.object({
  url: z.url(),
  headers: stringMapSchema.optional(),
  command: z.never().optional(),
  args: z.never().optional(),
  env: z.never().optional(),
  cwd: z.never().optional(),
}).passthrough();
const mcpFileSchema = z.object({
  mcpServers: z.record(z.string(), z.union([stdioServerSchema, httpServerSchema])),
}).passthrough();

type ServerConfig = z.infer<typeof stdioServerSchema> | z.infer<typeof httpServerSchema>;
type ConfiguredServer = { config: ServerConfig; configDir: string };
type ConnectedServer = {
  client: Client;
  close: () => Promise<void>;
  name: string;
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readConfig(path: string) {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { servers: new Map<string, ConfiguredServer>(), diagnostics: [] };
    return {
      servers: new Map<string, ConfiguredServer>(),
      diagnostics: [`Could not read ${path}: ${errorMessage(error)}`],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      servers: new Map<string, ConfiguredServer>(),
      diagnostics: [`Invalid JSON in ${path}: ${errorMessage(error)}`],
    };
  }

  const fileShape = z.object({ mcpServers: z.record(z.string(), z.unknown()) }).passthrough();
  const shape = fileShape.safeParse(parsedJson);
  if (!shape.success) {
    return {
      servers: new Map<string, ConfiguredServer>(),
      diagnostics: [`Invalid ${path}: ${z.prettifyError(shape.error)}`],
    };
  }

  const servers = new Map<string, ConfiguredServer>();
  const diagnostics: string[] = [];
  const serverSchema = z.union([stdioServerSchema, httpServerSchema]);
  for (const [name, rawConfig] of Object.entries(shape.data.mcpServers)) {
    const result = serverSchema.safeParse(rawConfig);
    if (!result.success) {
      diagnostics.push(`Invalid ${path} server "${name}": ${z.prettifyError(result.error)}`);
      continue;
    }
    servers.set(name, { config: result.data as ServerConfig, configDir: dirname(path) });
  }
  return { servers, diagnostics };
}

export async function loadMcpServers(cwd: string, projectTrusted: boolean, agentDir = getAgentDir()) {
  const user = await readConfig(join(agentDir, "mcp.json"));
  if (!projectTrusted) return user;

  const project = await readConfig(join(cwd, CONFIG_DIR_NAME, "mcp.json"));
  return {
    servers: new Map([...user.servers, ...project.servers]),
    diagnostics: [...user.diagnostics, ...project.diagnostics],
  };
}

function safeToolPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .toLowerCase() || "tool";
}

export function mcpToolName(serverName: string, toolName: string) {
  const source = `${serverName}:${toolName}`;
  const base = `mcp_${safeToolPart(serverName)}_${safeToolPart(toolName)}`;
  if (base.length <= 64) return base;
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
  return `${base.slice(0, 55)}_${hash}`;
}

function uniqueToolName(serverName: string, toolName: string, used: Set<string>) {
  const preferred = mcpToolName(serverName, toolName);
  if (!used.has(preferred)) return preferred;

  const hash = createHash("sha256").update(`${serverName}:${toolName}`).digest("hex").slice(0, 8);
  const suffixed = `${preferred.slice(0, 55)}_${hash}`;
  if (!used.has(suffixed)) return suffixed;

  let index = 2;
  while (true) {
    const suffix = `_${index}`;
    const base = suffixed.slice(0, 64 - suffix.length);
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) return candidate;
    index += 1;
  }
}

function transportFor(server: ConfiguredServer) {
  const { config, configDir } = server;
  if (typeof config.command === "string") {
    const cwd = config.cwd
      ? isAbsolute(config.cwd) ? config.cwd : resolve(configDir, config.cwd)
      : undefined;
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      cwd,
      env: config.env ? { ...getDefaultEnvironment(), ...config.env } : undefined,
      stderr: "ignore",
    });
  }

  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  });
}

async function listAllTools(client: Client) {
  const tools: ConnectedServer["tools"] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(
      cursor ? { cursor } : undefined,
      { timeout: CONNECT_TIMEOUT_MS, maxTotalTimeout: CONNECT_TIMEOUT_MS },
    );
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export async function connectServer(name: string, server: ConfiguredServer) {
  const client = new Client({ name: "nativepi-mcp", version: "1.0.0" });
  const transport = transportFor(server);
  try {
    await client.connect(transport, {
      timeout: CONNECT_TIMEOUT_MS,
      maxTotalTimeout: CONNECT_TIMEOUT_MS,
    });
    return {
      client,
      name,
      tools: await listAllTools(client),
      close: async () => {
        if (transport instanceof StreamableHTTPClientTransport) {
          await transport.terminateSession().catch(() => {});
        }
        await client.close();
      },
    } satisfies ConnectedServer;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

function base64Bytes(data: string) {
  return Math.floor(data.length * 0.75);
}

function isCallToolResult(value: unknown): value is CallToolResult {
  return typeof value === "object" && value !== null && "content" in value && Array.isArray(value.content);
}

export function mcpResultText(result: CallToolResult) {
  const sections: string[] = [];
  for (const item of result.content) {
    if (item.type === "text") {
      sections.push(item.text);
    } else if (item.type === "audio") {
      sections.push(`[Audio content: ${item.mimeType}, approximately ${formatSize(base64Bytes(item.data))}]`);
    } else if (item.type === "resource_link") {
      sections.push(
        [`Resource: ${item.name}`, item.description, item.uri, item.mimeType].filter(Boolean).join("\n"),
      );
    } else if (item.type === "resource") {
      const resource = item.resource;
      sections.push(
        "text" in resource
          ? `Resource ${resource.uri}\n${resource.text}`
          : `Resource ${resource.uri}\n[Binary content: ${resource.mimeType ?? "unknown type"}, approximately ${formatSize(base64Bytes(resource.blob))}]`,
      );
    }
  }

  if (result.structuredContent !== undefined) {
    sections.push(`Structured content:\n${JSON.stringify(result.structuredContent, null, 2)}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

async function boundedText(text: string, toolCallId: string) {
  const truncation = truncateHead(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncation.truncated) return { text: truncation.content, fullOutputFile: undefined };

  await mkdir(MCP_OUTPUT_DIR, { recursive: true });
  const safeId = toolCallId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "tool";
  const fullOutputFile = join(MCP_OUTPUT_DIR, `${process.pid}-${safeId}.txt`);
  await writeFile(fullOutputFile, text, { encoding: "utf8", mode: 0o600 });
  return {
    text: `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${fullOutputFile}]`,
    fullOutputFile,
  };
}

function imageContent(result: CallToolResult) {
  return result.content
    .filter((item) => item.type === "image")
    .map((item) => ({ type: "image" as const, data: item.data, mimeType: item.mimeType }));
}

export default function mcpExtension(pi: ExtensionAPI) {
  let serverClosers: Array<() => Promise<void>> = [];
  let registeredMcpToolNames = new Set<string>();

  const closeServers = async () => {
    const active = serverClosers;
    serverClosers = [];
    await Promise.allSettled(active.map((close) => close()));
  };

  const deactivateStaleTools = (nextNames: Set<string>) => {
    try {
      const getActive = (pi as unknown as { getActiveTools?: () => string[] }).getActiveTools;
      const setActive = (pi as unknown as { setActiveTools?: (names: string[]) => void }).setActiveTools;
      if (typeof getActive !== "function" || typeof setActive !== "function") return;
      const active = new Set(getActive.call(pi));
      let changed = false;
      for (const old of registeredMcpToolNames) {
        if (!nextNames.has(old) && active.has(old)) {
          active.delete(old);
          changed = true;
        }
      }
      for (const name of nextNames) {
        if (!active.has(name)) {
          active.add(name);
          changed = true;
        }
      }
      if (changed) setActive.call(pi, [...active]);
    } catch {
      // Active-tool management is best-effort; stale tools remain registered but inactive.
    }
  };

  pi.on("session_start", async (_event, context) => {
    await closeServers();
    const previousNames = new Set(registeredMcpToolNames);
    const loaded = await loadMcpServers(context.cwd, context.isProjectTrusted());
    for (const diagnostic of loaded.diagnostics) context.ui.notify(diagnostic, "warning");

    const attempts = await Promise.all(
      [...loaded.servers].map(async ([name, server]) => {
        try {
          return { ok: true as const, server: await connectServer(name, server) };
        } catch (error) {
          return { ok: false as const, name, error: errorMessage(error) };
        }
      }),
    );

    const connected = attempts.flatMap((attempt) => attempt.ok ? [attempt.server] : []);
    serverClosers = connected.map((server) => server.close);
    for (const attempt of attempts) {
      if (!attempt.ok) context.ui.notify(`MCP server ${attempt.name}: ${attempt.error}`, "warning");
    }

    const usedNames = new Set(pi.getAllTools().map((tool) => tool.name));
    for (const name of previousNames) usedNames.delete(name);
    let toolCount = 0;
    const nextNames = new Set<string>();
    for (const server of connected) {
      for (const tool of server.tools) {
        const name = uniqueToolName(server.name, tool.name, usedNames);
        usedNames.add(name);
        nextNames.add(name);
        toolCount += 1;
        pi.registerTool({
          name,
          label: `${server.name}: ${tool.title ?? tool.name}`,
          description: `${tool.description ?? `Run ${tool.name}`} (MCP server: ${server.name}; original tool: ${tool.name})`,
          parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
          async execute(toolCallId, params, signal) {
            const response = await server.client.callTool(
              { name: tool.name, arguments: params },
              CallToolResultSchema,
              { signal },
            );
            if (!isCallToolResult(response)) {
              throw new Error("This MCP tool returned an asynchronous task, which is not supported.");
            }
            const result = response;
            const rawText = mcpResultText(result) || (imageContent(result).length > 0 ? "" : "MCP tool returned no content.");
            const output = await boundedText(rawText, toolCallId);
            if (result.isError) {
              const error = new Error(output.text || "MCP tool failed without an error message.");
              (error as unknown as Record<string, unknown>).details = {
                server: server.name,
                tool: tool.name,
                fullOutputFile: output.fullOutputFile,
              };
              throw error;
            }
            return {
              content: [
                ...(output.text ? [{ type: "text" as const, text: output.text }] : []),
                ...imageContent(result),
              ],
              details: {
                server: server.name,
                tool: tool.name,
                fullOutputFile: output.fullOutputFile,
              },
            };
          },
        });
      }
    }

    registeredMcpToolNames = nextNames;
    deactivateStaleTools(nextNames);

    context.ui.setStatus(
      "mcp",
      connected.length > 0
        ? context.ui.theme.fg(
          "muted",
          `MCP ${connected.length} server${connected.length === 1 ? "" : "s"} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`,
        )
        : undefined,
    );
  });

  pi.on("session_shutdown", async (_event, context) => {
    context.ui.setStatus("mcp", undefined);
    await closeServers();
    const nextNames = new Set<string>();
    deactivateStaleTools(nextNames);
    registeredMcpToolNames = nextNames;
  });
}
