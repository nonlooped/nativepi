/** Real Electron/Pi lifecycle smoke. Requires a graphical user session and a built
 * desktop. Pass an installed executable to test packaging. No model account used.
 * bun apps/desktop/scripts/check-background-service.ts [electron-or-app-executable]
 */
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { ServiceClient } from "../src/main/service/client.ts";
import { SERVICE_PROTOCOL } from "../src/shared/background-service.ts";
const desktop = resolve(import.meta.dir, "..");
const packaged = Boolean(process.argv[2]);
const executable = process.argv[2] ?? createRequire(import.meta.url)("electron") as string;
const root = await mkdtemp(join(tmpdir(), "nativepi-host-smoke-"));
const agent = join(root, "pi");
const descriptor = join(root, "data", "background", "host.json");
let calls = 0;
const http = createServer((request, response) => {
  calls++; request.resume();
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const chunk = (content: string) => response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`);
  chunk("Still running locally. ");
  const timer = setInterval(() => chunk("More output. "), 100);
  response.on("close", () => clearInterval(timer));
});
await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
const address = http.address();
if (!address || typeof address === "string") throw new Error("Fixture bind failed");
await mkdir(agent, { recursive: true });
await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { fixture: { api: "openai-completions", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-fixture-only", models: [{ id: "fixture", name: "Local lifecycle fixture", reasoning: false, input: ["text"], contextWindow: 32000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
const args = [...(packaged ? [] : [desktop]), "--nativepi-service", `--nativepi-data-dir=${join(root, "data")}`];
const children: ReturnType<typeof spawn>[] = [];
function launch() { const child = spawn(executable, args, { env: { ...process.env, ELECTRON_RUN_AS_NODE: "", PI_CODING_AGENT_DIR: agent }, stdio: "ignore" }); children.push(child); return child; }
const clients: ServiceClient[] = [];
function client() { const value = new ServiceClient(descriptor, () => {}, () => {}); clients.push(value); return value; }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until<T>(read: () => Promise<T>, accept: (result: T) => boolean): Promise<T> {
  for (let i = 0; i < 100; i++) { try { const result = await read(); if (accept(result)) return result; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Lifecycle state did not settle");
}
try {
  launch();
  const owner = await until(async () => JSON.parse(await readFile(descriptor, "utf8")), value => Boolean(value.pid));
  const duplicate = launch();
  await new Promise<void>((resolve, reject) => { duplicate.once("exit", code => code === 0 ? resolve() : reject(new Error("Duplicate host did not exit cleanly"))); duplicate.once("error", reject); });
  assert(JSON.parse(await readFile(descriptor, "utf8")).pid === owner.pid, "Duplicate start replaced owner");
  const first = client();
  const { path: projectDir } = await first.request("chatWorkspace", {}) as { path: string };
  await first.request("setTrust", { projectDir, trusted: true });
  await first.request("ensurePi", { projectDir });
  const state = await first.request("getState", { projectDir }) as any;
  const target = { projectDir, sessionFile: state.state.sessionFile };
  const submit = first.request("submit", { projectDir, sessionFile: null, message: "Stream for lifecycle verification.", model: { provider: "fixture", id: "fixture" } }).catch(error => error);
  await until(async () => await first.request("getState", target) as any, value => value.state?.isStreaming);
  const initialCalls = calls;
  const terminal = await first.request("terminalCreate", { projectDir }) as any;
  assert(terminal.terminal?.id, "PTY was not created");
  first.dispose();
  const resumed = client();
  const snapshot = await until(async () => await resumed.request("readSessionSnapshot", target) as any, value => value.consistency === "stable" && value.liveEvents?.some((event: any) => event.type === "message_start"));
  assert(snapshot.liveEvents.some((event: any) => event.type === "agent_start"), "Run state missing on reconnect");
  assert(calls === initialCalls, "Reconnect replayed model execution");
  const attached = await resumed.request("terminalAttach", { projectDir, terminalId: terminal.terminal.id });
  assert(attached, "Detached PTY was lost");
  await resumed.request("abort", target);
  await until(async () => await resumed.request("getState", target) as any, value => !value.state?.isStreaming);
  await submit;
  const inFlight = resumed.request("submit", { ...target, message: "Crash interruption fixture." }).catch(error => error);
  await until(async () => await resumed.request("getState", target) as any, value => value.state?.isStreaming);
  const beforeCrash = calls;
  process.kill(owner.pid, "SIGKILL");
  // Pi acknowledges a prompt independently of completing its turn. It may
  // already have replied; transport tests cover a lost pending acknowledgement.
  await inFlight;
  await until(async () => { try { await resumed.request("getState", target); return false; } catch { return true; } }, value => value);
  launch();
  await until(async () => JSON.parse(await readFile(descriptor, "utf8")), value => value.pid !== owner.pid);
  const recovered = client();
  const recovery = await recovered.request("getState", target) as any;
  assert(!recovery.state.isStreaming, "Host restart resumed an interrupted turn");
  assert(calls === beforeCrash, "Host restart replayed model execution");
  const current = JSON.parse(await readFile(descriptor, "utf8"));
  await writeFile(descriptor, JSON.stringify({ ...current, protocol: SERVICE_PROTOCOL + 1 }));
  let incompatible = false;
  try { await client().request("getState", target); } catch (error) { incompatible = String(error).includes("incompatible"); }
  assert(incompatible, "Incompatible protocol accepted work");
  await client().stop();
  console.log("PASS: independent Electron host, duplicate lock, real Pi streaming reconnect, retained PTY, cancellation, host crash, no replay, incompatible refusal and explicit stop");
} finally {
  for (const value of clients) value.dispose();
  for (const child of children) { try { child.kill("SIGTERM"); } catch {} }
  http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()));
  // Let Pi's disconnect handler settle the isolated fixture's credential writes.
  await new Promise(resolve => setTimeout(resolve, 250));
  await rm(root, { recursive: true, force: true });
}
