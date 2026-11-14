import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { ARTIFACT_INSTRUCTIONS, prepareArtifactSource, registerArtifacts, requestArtifactPreview } from "./artifacts.ts";
import { artifactFromDetails, MAX_ARTIFACT_HTML } from "../../../shared/htmlArtifacts.ts";

const dirs: string[] = [];
async function fixture() { const dir = await mkdtemp(join(tmpdir(), "nativepi-artifacts-")); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

test("built-in render stores a self-contained snapshot that survives source deletion and JSON session replay", async () => {
  const dir = await fixture();
  const file = join(dir, "visual.html");
  await writeFile(file, '<!doctype html><html><body><h1>Usage</h1><script>let count=0</script></body></html>');
  const tools = new Map<string, ToolDefinition>();
  const hooks: Function[] = [];
  registerArtifacts({ registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool), on: (_name: string, hook: Function) => hooks.push(hook) } as unknown as ExtensionAPI);
  const result = await tools.get("html_render")!.execute("render", { path: file, title: "Usage", height: 300 }, undefined, undefined, { cwd: dir } as never);
  await rm(file);
  const artifact = artifactFromDetails(JSON.parse(JSON.stringify(result.details)));
  expect(artifact?.html).toContain("<h1>Usage</h1>");
  expect(artifact?.html).toContain("let count=0");
  expect(artifact?.title).toBe("Usage");
  expect(hooks[0]!({ systemPrompt: "Original" }).systemPrompt).toBe(`Original\n\n${ARTIFACT_INSTRUCTIONS}`);
  expect(tools.has("html_preview")).toBe(true);
});

test("embeds relative local raster images and refuses disguised non-image files", async () => {
  const dir = await fixture();
  const image = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  await writeFile(join(dir, "chart.png"), image);
  const html = await prepareArtifactSource({ html: '<img src="chart.png">' }, dir);
  expect(html).toContain(`data:image/png;base64,${image.toString("base64")}`);
  await writeFile(join(dir, "secret.png"), "not an image");
  await expect(prepareArtifactSource({ html: '<img src="secret.png">' }, dir)).rejects.toThrow("Unsupported local image");
  await expect(prepareArtifactSource({ html: '<img src="missing.png">' }, dir)).rejects.toThrow();
});

test("validates source selection, limits, symlink targets, and cancellation before publishing", async () => {
  const dir = await fixture();
  for (const source of [{}, { html: "x", path: "/x.html" }, { html: "x".repeat(MAX_ARTIFACT_HTML + 1) }, { path: "relative.html" }, { path: "//server/file.html" }]) {
    await expect(prepareArtifactSource(source, dir)).rejects.toThrow();
  }
  await writeFile(join(dir, "data.json"), "{}");
  await symlink(join(dir, "data.json"), join(dir, "pretend.html"));
  await expect(prepareArtifactSource({ path: join(dir, "pretend.html") }, dir)).rejects.toThrow("HTML file");
  await expect(prepareArtifactSource({ html: "<p>Cancelled</p>" }, dir, AbortSignal.abort())).rejects.toThrow();
  await expect(requestArtifactPreview({ html: "<p>Test</p>", width: 728 })).rejects.toThrow("desktop host");
});

test("rejects viewport height sizing loops while allowing CSS pixels and prose", async () => {
  for (const html of ['<style>main{min-height:100vh}</style>', '<main style="height:50dvh"></main>']) {
    await expect(prepareArtifactSource({ html }, "/tmp")).rejects.toThrow("viewport-height");
  }
  expect(await prepareArtifactSource({ html: '<p>Do not use 100vh</p><style>canvas{height:300px}</style>' }, "/tmp")).toContain("300px");
});
