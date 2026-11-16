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
