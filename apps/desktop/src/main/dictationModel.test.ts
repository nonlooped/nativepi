import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DictationModel } from "./dictationModel.ts";
import type { DictationStatus } from "../shared/dictation.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function store(response: (signal: AbortSignal) => Response | Promise<Response>) {
  const directory = await mkdtemp(join(tmpdir(), "nativepi-dictation-"));
  directories.push(directory);
  const updates: DictationStatus[] = [];
  const content = "verified speech model";
  const model = { filename: "model.gguf", bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex"), url: "https://example.test/model" };
  const fetchModel = ((_url: unknown, init: RequestInit) => response(init.signal!)) as typeof fetch;
  return { directory, content, updates, service: new DictationModel(directory, update => updates.push(update), fetchModel, model) };
}
test("installs only verified bytes, publishes progress and reuses the completed model", async () => {
  let calls = 0;
  const item = await store(() => { calls++; return new Response("verified speech model"); });
  expect((await item.service.status()).phase).toBe("missing");
  expect((await item.service.install(new AbortController().signal)).phase).toBe("ready");
  expect(await readFile(item.service.path, "utf8")).toBe(item.content);
  expect(item.updates.map(update => update.phase)).toEqual(["downloading", "downloading", "verifying", "ready"]);
  expect((await item.service.install(new AbortController().signal)).phase).toBe("ready");
  expect(calls).toBe(1);
  expect(await readdir(item.directory)).toEqual(["model.gguf"]);
});
test("rejects truncated and same-size corrupt models without publishing them", async () => {
  for (const content of ["short", "x".repeat(21)]) {
    const item = await store(() => new Response(content));
    expect((await item.service.install(new AbortController().signal)).phase).toBe("error");
    expect(await readdir(item.directory)).toEqual([]);
  }
});
test("cancels the download, removes temporary bytes and permits retry", async () => {
  let started!: () => void;
  const pending = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  const item = await store(signal => {
    if (calls++) return new Response("verified speech model");
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("verified"));
      signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
      started();
    } }));
  });
  const controller = new AbortController();
  const task = item.service.install(controller.signal);
  await pending;
  await expect(item.service.install(new AbortController().signal)).rejects.toThrow("already running");
  controller.abort();
  expect((await task).phase).toBe("missing");
  expect(await readdir(item.directory)).toEqual([]);
  expect((await item.service.install(new AbortController().signal)).phase).toBe("ready");
});
test("reports network failures without retaining a partial installation", async () => {
  const item = await store(() => new Response("unavailable", { status: 503 }));
  const result = await item.service.install(new AbortController().signal);
  expect(result.error).toContain("503");
  expect(await readdir(item.directory)).toEqual([]);
});
test("detects a same-size damaged model already on disk and repairs it", async () => {
  const item = await store(() => new Response("verified speech model"));
  await writeFile(item.service.path, "x".repeat(item.content.length));
  expect((await item.service.status()).error).toContain("damaged");
  expect((await item.service.install(new AbortController().signal)).phase).toBe("ready");
  expect(await readFile(item.service.path, "utf8")).toBe(item.content);
});
