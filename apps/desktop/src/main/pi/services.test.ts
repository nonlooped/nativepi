import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { isProjectTrusted, piServices } from "./services.ts";
const root = await mkdtemp(join(tmpdir(), "nativepi-services-"));
const agent = join(root, "agent");
await mkdir(agent);
const project = join(root, "project");
await mkdir(project);
const previous = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agent;
afterAll(async () => {
  if (previous === undefined)
    delete process.env.PI_CODING_AGENT_DIR;
  else
    process.env.PI_CODING_AGENT_DIR = previous;
  await rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  await rm(join(agent, "trust.json"), { force: true });
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
});
test("read services apply fallback in memory without persisting npmCommand", async () => {
  const file = join(agent, "settings.json");
  await writeFile(file, JSON.stringify({ defaultProjectTrust: "always" }));
  const services = piServices(project);
  const command = services.settings.getNpmCommand()!;
  const npm = createRequire(import.meta.url)("npm/package.json") as { version: string };
  expect(execFileSync(command[0]!, [...command.slice(1), "--version"], { encoding: "utf8" }).trim()).toBe(npm.version);
  await services.settings.flush();
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ defaultProjectTrust: "always" });
});
test("package discovery leaves the host environment untouched and uses an isolated process", async () => {
  const original = process.env.ELECTRON_RUN_AS_NODE;
  const services = piServices(project);
  const result = services.pm.resolve();
  expect(process.env.ELECTRON_RUN_AS_NODE).toBe(original);
  expect((await result).extensions).toEqual([]);
  expect(process.env.ELECTRON_RUN_AS_NODE).toBe(original);
});
test("explicit npm argv and Pi default/recorded trust decisions survive", async () => {
  const file = join(agent, "settings.json");
  await writeFile(file, JSON.stringify({ npmCommand: ["custom", "--flag"], defaultProjectTrust: "always" }));
  expect(piServices(project).settings.getNpmCommand()).toEqual(["custom", "--flag"]);
  expect(isProjectTrusted(project)).toBe(true);
  new ProjectTrustStore(agent).set(project, false);
  expect(isProjectTrusted(project)).toBe(false);
  new ProjectTrustStore(agent).set(project, true);
  expect(isProjectTrusted(project)).toBe(true);
});
