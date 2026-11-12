import type { EditableMcpServer, McpScope, McpServerEntry } from "../types.ts";

export type Draft = {
  originalName?: string;
  scope: McpScope;
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string;
  cwd: string;
  url: string;
  metadata: string;
};

export function emptyDraft(projectTrusted: boolean): Draft {
  return {
    scope: projectTrusted ? "project" : "user",
    name: "",
    transport: "stdio",
    command: "",
    args: "",
    cwd: "",
    url: "",
    metadata: "",
  };
}

export function draftFor(server: McpServerEntry): Draft {
  const config = server.config;
  return {
    originalName: server.name,
    scope: server.scope,
    name: server.name,
    transport: config.transport,
    command: config.transport === "stdio" ? config.command : "",
    args: config.transport === "stdio" ? config.args.join("\n") : "",
    cwd: config.transport === "stdio" ? config.cwd ?? "" : "",
    url: config.transport === "http" ? config.url : "",
    metadata: JSON.stringify(
      config.transport === "stdio" ? config.env ?? {} : config.headers ?? {},
      null,
      2,
    ),
  };
}

function stringMap(value: string, label: string) {
  if (!value.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry !== "string") throw new Error(`${label} value “${key}” must be text.`);
    if (/[\r\n]/.test(entry)) throw new Error(`${label} values cannot contain line breaks.`);
  }
  return Object.fromEntries(Object.entries(parsed)) as Record<string, string>;
}

export function configFor(draft: Draft): EditableMcpServer {
  if (draft.transport === "http") {
    const headers = stringMap(draft.metadata, "Headers");
    return {
      transport: "http",
      url: draft.url.trim(),
      ...(headers ? { headers } : {}),
    };
  }
  const cwd = draft.cwd.trim();
  const env = stringMap(draft.metadata, "Environment variables");
  return {
    transport: "stdio",
    command: draft.command.trim(),
    args: draft.args ? draft.args.split(/\r?\n/) : [],
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
  };
}

export function saveParametersFor(draft: Draft, config: EditableMcpServer) {
  return {
    scope: draft.scope,
    ...(draft.originalName === undefined ? {} : { originalName: draft.originalName }),
    name: draft.name.trim(),
    config,
  };
}
