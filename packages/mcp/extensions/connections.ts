import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, type TUnsafe } from "typebox";
import { z } from "zod";
import type { ConfiguredServer } from "./config.ts";

const CONNECT_TIMEOUT_MS = 15_000;
const MCP_OUTPUT_DIR = join(tmpdir(), "nativepi-mcp");
export type ConnectedServer = {
  client: Client;
  close: () => Promise<void>;
  name: string;
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"];
};

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

export function uniqueToolName(serverName: string, toolName: string, used: Set<string>) {
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

async function listAllTools(client: Client, signal?: AbortSignal) {
  const tools: ConnectedServer["tools"] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(
      cursor ? { cursor } : undefined,
      { signal, timeout: CONNECT_TIMEOUT_MS, maxTotalTimeout: CONNECT_TIMEOUT_MS },
    );
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export async function connectServer(name: string, server: ConfiguredServer, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const client = new Client({ name: "nativepi-mcp", version: "1.0.0" });
  const transport = transportFor(server);
  try {
    await client.connect(transport, {
      signal,
      timeout: CONNECT_TIMEOUT_MS,
      maxTotalTimeout: CONNECT_TIMEOUT_MS,
    });
    return {
      client,
      name,
      tools: await listAllTools(client, signal),
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

export function serverTool(server: ConnectedServer, tool: ConnectedServer["tools"][number], name: string): ToolDefinition<TUnsafe<Record<string, unknown>>> {
  return {
    name,
    label: `${server.name}: ${tool.title ?? tool.name}`,
    description: `${tool.description ?? `Run ${tool.name}`} (MCP server: ${server.name}; original tool: ${tool.name})`,
    parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
    ...(tool.outputSchema ? { outputSchema: Type.Unsafe(tool.outputSchema) } : {}),
    annotations: tool.annotations,
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
        ...(result.structuredContent === undefined ? {} : { structuredContent: z.json().parse(result.structuredContent) }),
        ...(result.isError ? { isError: true } : {}),
      };
    },
  };
}
