import { z } from "zod";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { piServices } from "./pi/services.ts";
import { mcpSetupSchema, mcpReportSchema, resourceChangeSchema, type AgentSetup, type ResourceChange } from "../shared/agent-setup.ts";

export async function agentSetup(projectDir: string): Promise<AgentSetup> {
  const { settings } = piServices(projectDir);
  const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir: getAgentDir(), settingsManager: settings, noExtensions: true, noThemes: true, noContextFiles: true });
  await loader.reload();
  const skills = loader.getSkills();
  const prompts = loader.getPrompts();
  // Pi 1.5.2 exposes the MCP extension but not its config reader at the package
  // root. Keep this pinned-version adapter here; never duplicate its merge/trust rules.
  const configModule = await import(new URL("./extensions/mcp/config.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href);
  const configured = z.object({ servers: z.array(z.object({
    name: z.string(), scope: z.string().optional(), source: z.string(), override: z.string().optional(),
    config: z.object({ enabled: z.boolean().optional(), exposure: z.string().optional() }),
  })), errors: z.array(z.string()) }).parse(configModule.loadMcpConfig({ agentDir: getAgentDir(), cwd: projectDir, projectTrusted: settings.isProjectTrusted() }));
  return {
    servers: configured.servers.map(server => ({ name: server.name, scope: server.scope ?? "global", source: server.source, override: server.override, enabled: server.config.enabled !== false, exposure: server.config.exposure ?? "codemode", state: server.config.enabled === false ? "disabled" : "not-checked", tools: [] })),
    projectTrusted: settings.isProjectTrusted(),
    resources: [
      ...skills.skills.map(s => ({ kind: "skill" as const, name: s.name, description: s.description, path: s.filePath, scope: s.sourceInfo.scope, source: s.sourceInfo.source })),
      ...prompts.prompts.map(s => ({ kind: "prompt" as const, name: s.name, description: s.description, path: s.filePath, scope: s.sourceInfo.scope, source: s.sourceInfo.source })),
    ],
    errors: [...configured.errors, ...[...skills.diagnostics, ...prompts.diagnostics].map(d => `${d.path ?? "Resource"}: ${d.message}`)],
  };
}
/** Create only: exclusive writes cannot overwrite CLI edits or package resources. */
export async function createAgentResource(input: ResourceChange): Promise<void> {
  const value = resourceChangeSchema.parse(input);
  const { settings } = piServices(value.projectDir);
  if (value.scope === "project" && !settings.isProjectTrusted()) throw new Error("Trust the project before adding project resources.");
  const base = value.scope === "user" ? getAgentDir() : join(value.projectDir, ".pi");
  const directory = join(base, value.kind === "skill" ? "skills" : "prompts");
  // Do not follow a redirected resource directory when writing from the UI.
  for (const dir of [base, directory, ...(value.kind === "skill" ? [join(directory, value.name)] : [])]) {
    try { if ((await lstat(dir)).isSymbolicLink()) throw new Error("Use your editor to manage linked resource directories."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await mkdir(dir, { recursive: true });
  }
  await writeFile(value.kind === "skill" ? join(directory, value.name, "SKILL.md") : join(directory, `${value.name}.md`), value.content, { flag: "wx" });
}

/** Pi CLI owns validation, merging and persistence of mcp.json. No shell involved. */
export async function configureMcp(input: import("../shared/agent-setup.ts").McpSetupChange): Promise<string | import("../shared/agent-setup.ts").McpReport> {
  const value = mcpSetupSchema.parse(input);
  const { settings } = piServices(value.projectDir);
  // CLI MCP commands accept local configuration without a trust prompt. Gate it here.
  if (value.scope === "project" && value.action !== "check" && !settings.isProjectTrusted()) throw new Error("Trust the project before changing project MCP configuration. Project trust is unchanged.");
  const { execFile } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
  const args = value.action === "check" ? ["mcp", "list", "--json"] : ["mcp", value.action, ...(value.scope === "project" ? ["--local"] : []), value.name];
  if (value.action === "add") args.push(...(value.url ? ["--url", value.url] : ["--", value.command!, ...(value.args ?? [])]));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args], { cwd: value.projectDir, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error && value.action !== "check") reject(new Error("Pi could not update MCP configuration. Check the server name and settings."));
      else if (value.action === "check") {
        try { resolve(mcpReportSchema.parse(JSON.parse(stdout))); }
        catch { reject(new Error("Pi could not complete the MCP check. A server may have timed out. Use /mcp for details.")); }
      }
      else resolve((stdout || stderr || (error ? "MCP health check failed or timed out." : "MCP configuration saved.")).replace(/\x1b\[[0-9;]*m/g, ""));
    });
  });
}
