import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentResource } from "./agentSetup.ts";

test("resource creation preserves existing CLI files and refuses traversal and links", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-setup-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  try {
    const input = { projectDir: root, kind: "prompt" as const, scope: "user" as const, name: "review", content: "Review $ARGUMENTS" };
    await createAgentResource(input);
    await expect(createAgentResource({ ...input, content: "overwrite" })).rejects.toThrow();
    expect(await readFile(join(root, "agent/prompts/review.md"), "utf8")).toBe("Review $ARGUMENTS");
    await expect(createAgentResource({ ...input, name: "../escape" })).rejects.toThrow();
    await expect(createAgentResource({ ...input, scope: "project" })).rejects.toThrow("Trust");
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, "agent/skills"));
    await expect(createAgentResource({ ...input, kind: "skill" })).rejects.toThrow("linked");
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP discovery uses Pi trust and config precedence without connecting or exposing secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-discovery-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  try {
    const { writeFile } = await import("node:fs/promises");
    const { agentSetup } = await import("./agentSetup.ts");
    await mkdir(join(root, "agent")); await mkdir(join(root, ".pi"));
    await writeFile(join(root, "agent/mcp.json"), JSON.stringify({ mcpServers: { docs: { url: "https://example.invalid/mcp", enabled: false, headers: { Authorization: "secret-value" } } } }));
    await writeFile(join(root, ".pi/mcp.json"), JSON.stringify({ mcpServers: { hidden: { command: "must-not-run" } } }));
    const setup = await agentSetup(root);
    expect(setup.servers.map(server => [server.name, server.state])).toEqual([["docs", "disabled"]]);
    expect(setup.projectTrusted).toBe(false);
    expect(JSON.stringify(setup.servers)).not.toContain("secret-value");
    expect(setup.servers[0]?.source).toBe(join(root, "agent/mcp.json"));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
