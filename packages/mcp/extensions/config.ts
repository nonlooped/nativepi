import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import type { EditableMcpServer, McpScope } from "../types.ts";

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
export type ServerConfig = z.infer<typeof stdioServerSchema> | z.infer<typeof httpServerSchema>;
export type ConfiguredServer = { config: ServerConfig; configDir: string };
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
    servers.set(name, { config: result.data, configDir: dirname(path) });
  }
  return { servers, diagnostics };
}

const jsonObjectSchema = z.record(z.string(), z.unknown());
const knownServerFields = new Set(["command", "args", "env", "cwd", "url", "headers"]);

function configPath(scope: McpScope, cwd: string, agentDir = getAgentDir()) {
  return scope === "user"
    ? join(agentDir, "mcp.json")
    : join(cwd, CONFIG_DIR_NAME, "mcp.json");
}

async function readConfigObject(path: string) {
  try {
    const parsed = jsonObjectSchema.safeParse(JSON.parse(await readFile(path, "utf8")) as unknown);
    if (!parsed.success) throw new Error(`Invalid ${path}: expected a JSON object.`);
    return parsed.data;
  } catch (error) {
    if (isMissingFile(error)) return {};
    throw error;
  }
}

async function writeConfigObject(path: string, value: Record<string, unknown>) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function persistedConfig(config: EditableMcpServer) {
  if (config.transport === "stdio") {
    return {
      command: config.command,
      ...(config.args.length > 0 ? { args: config.args } : {}),
      ...(config.env ? { env: config.env } : {}),
      ...(config.cwd ? { cwd: config.cwd } : {}),
    };
  }
  return {
    url: config.url,
    ...(config.headers ? { headers: config.headers } : {}),
  };
}

export async function saveMcpServer(
  cwd: string,
  projectTrusted: boolean,
  input: { scope: McpScope; originalName?: string; name: string; config: EditableMcpServer },
  agentDir = getAgentDir(),
) {
  if (input.scope === "project" && !projectTrusted) {
    throw new Error("Trust this project before adding a project-only MCP server.");
  }
  const path = configPath(input.scope, cwd, agentDir);
  await withFileMutationQueue(path, async () => {
    const root = await readConfigObject(path);
    const servers = root.mcpServers === undefined
      ? {}
      : jsonObjectSchema.parse(root.mcpServers);
    const originalName = input.originalName ?? input.name;
    if ((!input.originalName || input.name !== originalName) && Object.hasOwn(servers, input.name)) {
      throw new Error(`An MCP server named “${input.name}” already exists in this scope.`);
    }

    const existing = jsonObjectSchema.safeParse(servers[originalName]);
    const unknown = existing.success
      ? Object.fromEntries(Object.entries(existing.data).filter(([key]) => !knownServerFields.has(key)))
      : {};
    const nextServers = { ...servers };
    if (input.originalName) delete nextServers[input.originalName];
    Object.defineProperty(nextServers, input.name, {
      value: { ...unknown, ...persistedConfig(input.config) },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    await writeConfigObject(path, { ...root, mcpServers: nextServers });
  });
}

export async function removeMcpServer(
  cwd: string,
  projectTrusted: boolean,
  scope: McpScope,
  name: string,
  agentDir = getAgentDir(),
) {
  if (scope === "project" && !projectTrusted) {
    throw new Error("Trust this project before changing its MCP servers.");
  }
  const path = configPath(scope, cwd, agentDir);
  await withFileMutationQueue(path, async () => {
    const root = await readConfigObject(path);
    const servers = root.mcpServers === undefined
      ? {}
      : jsonObjectSchema.parse(root.mcpServers);
    if (!Object.hasOwn(servers, name)) throw new Error(`No MCP server named “${name}” exists in this scope.`);
    const nextServers = { ...servers };
    delete nextServers[name];
    await writeConfigObject(path, { ...root, mcpServers: nextServers });
  });
}

export function editableConfig(config: ServerConfig): EditableMcpServer {
  return typeof config.command === "string"
    ? {
      transport: "stdio",
      command: config.command,
      args: config.args ?? [],
      ...(config.env ? { env: config.env } : {}),
      ...(config.cwd ? { cwd: config.cwd } : {}),
    }
    : {
      transport: "http",
      url: config.url,
      ...(config.headers ? { headers: config.headers } : {}),
    };
}

export async function loadMcpConfiguration(cwd: string, projectTrusted: boolean, agentDir = getAgentDir()) {
  const user = await readConfig(configPath("user", cwd, agentDir));
  const project = projectTrusted
    ? await readConfig(configPath("project", cwd, agentDir))
    : { servers: new Map<string, ConfiguredServer>(), diagnostics: [] };
  return { user, project, servers: new Map([...user.servers, ...project.servers]), diagnostics: [...user.diagnostics, ...project.diagnostics] };
}

export function serverIdentity(server: ConfiguredServer) {
  return JSON.stringify([server.configDir, server.config]);
}
