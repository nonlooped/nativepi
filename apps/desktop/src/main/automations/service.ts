import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  automationInputSchema,
  automationStateSchema,
  type AutomationInput,
  type AutomationRun,
  type AutomationState,
} from "../../shared/automations.ts";
import type { ThreadReference } from "../../shared/orchestration.ts";
import { nextOccurrence } from "./time.ts";
import type { HostEvent } from "./github.ts";
export interface AutomationAdapter {
  events(input: AutomationInput): Promise<HostEvent[]>;
  prepare(
    input: AutomationInput,
    runId: string,
    signal: AbortSignal,
    workspace: (path: string) => Promise<void>,
  ): Promise<ThreadReference>;
  dispatch(
    input: AutomationInput,
    run: AutomationRun,
    signal: AbortSignal,
  ): Promise<void>;
  stop(ref: ThreadReference): Promise<void>;
  busy(project: string | null): boolean;
}
/** Host-owned intent/history only. Transcripts and execution remain Pi-owned. */
export class AutomationService {
  private state: AutomationState = { version: 1, automations: [], runs: [] };
  private ready?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private ticking = false;
  private closed = false;
  private generations = new Map<string, number>();
  private active = new Map<
    string,
    {
      project: string | null;
      controller: AbortController;
      run: AutomationRun;
      task: Promise<void>;
    }
  >();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private file: string,
    private adapter: AutomationAdapter,
    private now = Date.now,
  ) {}
  async load() {
    this.ready ??= (async () => {
      try {
        this.state = automationStateSchema.parse(
          JSON.parse(await readFile(this.file, "utf8")),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      for (const run of this.state.runs)
        if (["preparing", "dispatched"].includes(run.status)) {
          run.status = "interrupted";
          run.detail =
            "App restarted; not replayed. Inspect transcript and workspace.";
          run.ended = this.now();
        }
      await this.save();
    })();
    await this.ready;
  }
  private save() {
    const data = JSON.stringify(this.state);
    const task = this.writes
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(`${this.file}.tmp`, data, { mode: 0o600 });
        await rename(`${this.file}.tmp`, this.file);
      });
    this.writes = task;
    return task;
  }
  async snapshot() {
    await this.load();
    return structuredClone(this.state);
  }
  async put(raw: AutomationInput) {
    await this.load();
    const input = automationInputSchema.parse(raw);
    if (input.id) await this.stop(input.id);
    const id = input.id ?? randomUUID();
    if (!input.id && this.state.automations.length >= 100)
      throw new Error("Maximum 100 automations");
    const existing = this.state.automations.find((a) => a.id === id);
    if (input.id && !existing) throw new Error("Automation no longer exists");
    const value = {
      id,
      input: { ...input, id },
      next: nextOccurrence(input.trigger, this.now()),
      seen: [] as string[],
      initialized: false,
      failures: 0,
      lastPoll: 0,
    };
    // Pause/resume does not forget consumed events or a once deadline.
    if (
      existing &&
      JSON.stringify(existing.input.trigger) === JSON.stringify(input.trigger)
    )
      Object.assign(value, {
        seen: existing.seen,
        initialized: existing.initialized,
        next: existing.next,
      });
    this.state.automations = [
      ...this.state.automations.filter((a) => a.id !== id),
      value,
    ];
    await this.save();
    return this.snapshot();
  }
  async remove(id: string) {
    await this.stop(id);
    this.state.automations = this.state.automations.filter((a) => a.id !== id);
    await this.save();
    return this.snapshot();
  }
  async stopSession(file: string) {
    for (const [id, a] of this.active)
      if (a.run.ref?.file === file) await this.stop(id);
  }
  async stop(id: string) {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    await this.load();
    const active = this.active.get(id);
    if (active) {
      active.controller.abort();
      if (active.run.ref) await this.adapter.stop(active.run.ref);
      await active.task;
      active.run.status = "stopped";
      active.run.detail = "Stopped; inspect any partial work.";
      active.run.ended = this.now();
      if (this.active.get(id) === active) this.active.delete(id);
      await this.save();
    }
  }
  private record(
    id: string,
    name: string,
    status: AutomationRun["status"],
    detail: string,
    context: string,
  ) {
    const run: AutomationRun = {
      id: randomUUID(),
      automationId: id,
      name,
      started: this.now(),
      status,
      detail,
      context,
    };
    if (!["preparing", "dispatched"].includes(status)) run.ended = this.now();
    this.state.runs.push(run);
    // Never drop an active run from the durable journal.
    while (this.state.runs.length > 1000) {
      const index = this.state.runs.findIndex(
        (r) => r.ended !== undefined || r.status === "skipped",
      );
      if (index < 0) break;
      this.state.runs.splice(index, 1);
    }
    return run;
  }
  ownsSession(id: string) {
    return [...this.active.values()].some((a) => a.run.ref?.id === id);
  }
  ownsWorkspace(cwd: string) {
    return [...this.active.values()].some(
      (a) =>
        a.run.workspace === cwd ||
        a.run.ref?.cwd === cwd ||
        a.project === cwd ||
        (a.project === null && !a.run.ref),
    );
  }
  async runNow(id: string) {
    await this.load();
    const a = this.state.automations.find((a) => a.id === id);
    if (!a) throw new Error("Automation unavailable");
    await this.start(a.id, "Explicit Run now");
    return this.snapshot();
  }
  private async start(
    id: string,
    context: string,
    generation = this.generations.get(id) ?? 0,
  ) {
    const a = this.state.automations.find((a) => a.id === id);
    if (!a || this.closed) return;
    if (generation !== (this.generations.get(id) ?? 0)) {
      this.record(
        id,
        a.input.name,
        "skipped",
        "Stop fenced this pending trigger; not replayed.",
        context,
      );
      await this.save();
      return;
    }
    if (this.active.size || this.adapter.busy(a.input.project)) {
      this.record(
        id,
        a.input.name,
        "skipped",
        "Another run or project writer is active; no queued replay.",
        context,
      );
      await this.save();
      return;
    }
    const run = this.record(
      id,
      a.input.name,
      "preparing",
      "Reserving workspace and Pi transcript",
      context,
    );
    const controller = new AbortController();
    const active = {
      project: a.input.project,
      controller,
      run,
      task: Promise.resolve(),
    };
    this.active.set(id, active);
    active.task = (async () => {
      try {
        await this.save();
        controller.signal.throwIfAborted();
        run.ref = await this.adapter.prepare(
          a.input,
          run.id,
          controller.signal,
          async (path) => {
            run.workspace = path;
            await this.save();
            controller.signal.throwIfAborted();
          },
        );
        await this.save();
        controller.signal.throwIfAborted();
        run.status = "dispatched";
        run.detail = "Dispatch requested; awaiting Pi outcome.";
        await this.save();
        controller.signal.throwIfAborted();
        await this.adapter.dispatch(a.input, run, controller.signal);
      } catch (error) {
        if (run.ref) await this.adapter.stop(run.ref).catch(() => {});
        run.status = controller.signal.aborted ? "stopped" : "failed";
        run.ended = this.now();
        run.detail =
          error instanceof Error ? error.message.slice(0, 4000) : String(error);
        if (run.status === "failed") {
          a.failures++;
          if (a.failures >= 3) a.input.enabled = false;
        }
        this.active.delete(id);
        await this.save();
      }
    })();
    await active.task;
    if (controller.signal.aborted && this.active.get(id) === active) {
      run.status = "stopped";
      run.detail = "Stopped; inspect any partial work.";
      run.ended = this.now();
      this.active.delete(id);
      await this.save();
    }
  }
  async outcome(sessionId: string, failed: boolean, detail: string) {
    for (const [id, active] of this.active)
      if (active.run.ref?.id === sessionId) {
        if (active.controller.signal.aborted) return;
        active.run.status = failed ? "failed" : "needs-review";
        active.run.detail = detail;
        active.run.ended = this.now();
        this.active.delete(id);
        const a = this.state.automations.find((a) => a.id === id);
        if (a) {
          a.failures = failed ? a.failures + 1 : 0;
          if (a.failures >= 3) a.input.enabled = false;
        }
        await this.save();
      }
  }
  async tick() {
    if (this.ticking || this.closed) return;
    this.ticking = true;
    try {
      await this.load();
      for (const a of [...this.state.automations]) {
        if (!a.input.enabled) continue;
        const now = this.now();
        const generation = this.generations.get(a.id) ?? 0;
        if (a.input.trigger.kind !== "github") {
          if (a.next === null || a.next > now) continue;
          const due = a.next;
          a.next = nextOccurrence(a.input.trigger, now);
          await this.save();
          if (now - due > 300000) {
            this.record(
              a.id,
              a.input.name,
              "skipped",
              "Missed time slot (over five minutes old); not replayed.",
              new Date(due).toISOString(),
            );
            await this.save();
          } else
            await this.start(
              a.id,
              `Scheduled for ${new Date(due).toISOString()}`,
              generation,
            );
          continue;
        }
        if (a.input.trigger.kind === "github") {
          if (now - a.lastPoll < 120000) continue;
          a.lastPoll = now;
          try {
            const events = await this.adapter.events(a.input);
            // Ignore results if edited/deleted/paused during host I/O.
            if (
              this.closed ||
              !this.state.automations.includes(a) ||
              !a.input.enabled
            )
              continue;
            a.pollFailures = 0;
            const fresh = events.filter((e) => !a.seen.includes(e.key));
            a.seen = [
              ...new Set([...a.seen, ...events.map((e) => e.key)]),
            ].slice(-2000);
            const initialized = a.initialized;
            a.initialized = true;
            await this.save(); // Consume before allocating a writer.
            if (initialized && fresh.length)
              await this.start(
                a.id,
                fresh
                  .map((e) => e.context)
                  .join("\n")
                  .slice(0, 30000),
                generation,
              );
          } catch (e) {
            a.pollFailures = (a.pollFailures ?? 0) + 1;
            if (a.pollFailures >= 3) a.input.enabled = false;
            this.record(
              a.id,
              a.input.name,
              "failed",
              `GitHub polling failed (${a.pollFailures}/3): ${e instanceof Error ? e.message : String(e)}`,
              "No work dispatched",
            );
            await this.save();
          }
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  startPolling() {
    this.timer ??= setInterval(() => {
      void this.tick().catch(console.error);
    }, 15000);
    void this.tick().catch(console.error);
  }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    for (const id of [...this.active.keys()]) await this.stop(id);
    await this.writes;
  }
}
