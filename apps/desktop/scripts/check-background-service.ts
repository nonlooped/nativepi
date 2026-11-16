/** Real Electron/Pi lifecycle smoke. Requires a graphical user session and a built
 * desktop. Pass an installed executable to test packaging. No model account used.
 * bun apps/desktop/scripts/check-background-service.ts [electron-or-app-executable]
 */
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
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
  calls++;
  const body: Buffer[] = [];
  request.on("data", chunk => body.push(Buffer.from(chunk)));
  request.on("end", () => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (content: string) => response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`);
    if (Buffer.concat(body).toString().includes("Independently review")) {
      const timer = setTimeout(() => { chunk(JSON.stringify({ findings: [], verifications: [] })); response.write(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`); response.end(); }, 300);
      response.on("close", () => clearTimeout(timer));
      return;
    }
    chunk("Still running locally. ");
    const timer = setInterval(() => chunk("More output. "), 100);
    response.on("close", () => clearInterval(timer));
  });
});
await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
const address = http.address();
if (!address || typeof address === "string") throw new Error("Fixture bind failed");
await mkdir(agent, { recursive: true });
await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { fixture: { api: "openai-completions", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-fixture-only", models: [{ id: "fixture", name: "Local lifecycle fixture", reasoning: false, input: ["text"], contextWindow: 32000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
const extension = join(root, "extension");
await mkdir(extension);
const api = resolve(desktop, "../../packages/extension-api/src");
await writeFile(join(extension, "package.json"), JSON.stringify({ name: "nativepi-integration-fixture", type: "module", pi: { extensions: ["./extension.ts"] }, nativepi: { renderer: "renderer.tsx" } }));
await writeFile(join(extension, "extension.ts"), `import { connect } from ${JSON.stringify(join(api, "host.ts"))}; import { z } from ${JSON.stringify(join(api, "schema.ts"))}; export default pi => { const channel = connect("nativepi-integration-fixture", { methods: { ping: { result: z.object({ alive: z.boolean() }) } }, events: {} }, { ping: () => ({ alive: true }) }); pi.on("session_shutdown", () => channel.dispose()); };`);
await writeFile(join(extension, "renderer.tsx"), 'import { defineRenderer } from "@nativepi/extension-api"; export default defineRenderer({ apiVersion: 1, requires: ["scoped-handles", "host-dispose"] });');
await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: [extension] }));
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
  const { path: repository } = await first.request("workWorkspace", {}) as { path: string };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.com");
  await writeFile(join(repository, "a.txt"), "original\n"); git("add", "."); git("commit", "-m", "initial"); git("config", "color.ui", "always");
  const { path: projectDir } = await first.request("taskWorkspaceCreate", { projectDir: repository, branch: "integration-task", base: "HEAD" }) as { path: string };
  await writeFile(join(projectDir, "a.txt"), "changed\n");
  const command = `${JSON.stringify(process.execPath)} -e "setInterval(() => {},30000)"`;
  await first.request("taskWorkspaceRecipe", { projectDir, recipe: { setup: "", run: command, check: "" } });
  await first.request("taskWorkspaceAction", { projectDir, action: "run", confirmed: true });
  await first.request("setTrust", { projectDir, trusted: true });
  await first.request("ensurePi", { projectDir });
  const state = await first.request("getState", { projectDir }) as any;
  const target = { projectDir, sessionFile: state.state.sessionFile };
  const submit = first.request("submit", { projectDir, sessionFile: null, message: "Stream for lifecycle verification.", model: { provider: "fixture", id: "fixture" } }).catch(error => error);
  await until(async () => await first.request("getState", target) as any, value => value.state?.isStreaming);
  await until(async () => await first.request("readSessionSnapshot", target) as any, value => value.liveEvents?.some((event: any) => event.type === "message_start" && event.message?.content?.some((part: any) => part.type === "text" && part.text.includes("More output."))));
  const graphical = await first.request("loadGraphicalExtensions", { projectDir }) as any;
  assert(graphical.extensions.some((entry: any) => entry.name === "nativepi-integration-fixture" && entry.code && !entry.error), "Graphical extension compilation failed");
  const ping = await first.request("callExtension", { ...target, extension: "nativepi-integration-fixture", method: "ping" }) as any;
  assert(ping.result?.alive === true, "Pi extension channel failed");
  const initialCalls = calls;
  const terminal = await first.request("terminalCreate", { projectDir }) as any;
  assert(terminal.terminal?.id, "PTY was not created");
  first.dispose();
  const resumed = client();
  const snapshot = await until(async () => await resumed.request("readSessionSnapshot", target) as any, value => value.consistency === "stable" && value.liveEvents?.some((event: any) => event.type === "message_start"));
  assert(snapshot.liveEvents.some((event: any) => event.type === "agent_start"), "Run state missing on reconnect");
  assert(calls === initialCalls, "Reconnect replayed model execution");
  assert(snapshot.liveEvents.some((event: any) => event.type === "message_start" && event.message?.content?.some((part: any) => part.type === "text" && part.text.includes("More output."))), "Reconnect lost emitted text deltas");
  const workspace = await resumed.request("taskWorkspaceList", { projectDir }) as any;
  assert(workspace.worktrees.find((entry: any) => entry.path === projectDir)?.managed?.status === "running", "Client disconnect stopped a workspace action");
  const reconnectedPing = await resumed.request("callExtension", { ...target, extension: "nativepi-integration-fixture", method: "ping" }) as any;
  assert(reconnectedPing.result?.alive === true, "Extension channel did not survive reconnect");
  const attached = await resumed.request("terminalAttach", { projectDir, terminalId: terminal.terminal.id });
  assert(attached, "Detached PTY was lost");
  await resumed.request("abort", target);
  await until(async () => await resumed.request("getState", target) as any, value => !value.state?.isStreaming);
  await submit;
  await resumed.request("reviewStart", { projectDir, options: { scope: "uncommitted", model: "fixture/fixture", reasoning: "off", tier: "default", allowChecks: false, verifyIds: [] } });
  const guarded = await resumed.request("taskWorkspaceAction", { projectDir, action: "inspect" }) as any;
  assert(guarded.blockers.some((text: string) => text.includes("agents")), "An active reviewer did not protect its workspace");
  const reviews = await until(async () => await resumed.request("reviewJobs", { projectDir }) as any, state => state.jobs.at(-1)?.status !== "running");
  const review = reviews.jobs.at(-1);
  assert(review.status === "completed" && review.inputs.some((input: any) => input.file === "a.txt"), `Integrated review failed: ${review.message}`);
  assert(review.sessionFile && (await readFile(review.sessionFile, "utf8")).includes('"role":"assistant"'), "Reviewer transcript was not persisted");
  await resumed.request("taskWorkspaceAction", { projectDir, action: "stop" });
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
  console.log("PASS: combined host/worktree/extension/review flow, real Pi delta reconnect, retained workspace command and PTY, graphical extension channel, review ownership and transcript, cancellation, host crash, no replay, incompatible refusal and explicit stop");
} finally {
  for (const value of clients) value.dispose();
  for (const child of children) { try { child.kill("SIGTERM"); } catch {} }
  http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()));
  // Let Pi's disconnect handler settle the isolated fixture's credential writes.
  await new Promise(resolve => setTimeout(resolve, 250));
  await rm(root, { recursive: true, force: true });
}
