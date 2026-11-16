import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutomationService, type AutomationAdapter } from "./service.ts";
import { nextOccurrence } from "./time.ts";
import type { AutomationInput } from "../../shared/automations.ts";
const input: AutomationInput = {
  name: "Check work",
  prompt: "Summarize failures",
  enabled: true,
  project: "/project",
  workspace: "shared",
  configuration: {
    provider: "test",
    model: "exact",
    reasoning: "off",
    tools: ["read"],
  },
  trigger: { kind: "daily", time: "09:00", timezone: "Asia/Riyadh" },
};
async function fixture(
  fn: (
    service: AutomationService,
    env: {
      now: number;
      dispatched: string[];
      events: { key: string; context: string }[];
      adapter: AutomationAdapter;
      file: string;
    },
  ) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "automations-test-"));
  const env = {
    now: Date.parse("2026-11-16T05:59:00Z"),
    dispatched: [] as string[],
    events: [] as { key: string; context: string }[],
    adapter: {} as AutomationAdapter,
    file: join(dir, "state.json"),
  };
  env.adapter = {
    busy: () => false,
    events: async () => env.events,
    prepare: async (_, id) => ({
      id,
      cwd: "/project",
      file: `/sessions/${id}`,
    }),
    dispatch: async (_, run) => {
      env.dispatched.push(run.ref!.id);
    },
    stop: async () => {},
  };
  try {
    await fn(new AutomationService(env.file, env.adapter, () => env.now), env);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("timezone recurrence skips nonexistent DST time and repeats only once", () => {
  expect(
    nextOccurrence(
      { kind: "daily", time: "02:30", timezone: "America/New_York" },
      Date.parse("2026-03-08T05:00:00Z"),
    ),
  ).toBe(Date.parse("2026-03-09T06:30:00Z"));
  expect(
    nextOccurrence(
      { kind: "daily", time: "01:30", timezone: "America/New_York" },
      Date.parse("2026-11-01T05:30:00Z"),
    ),
  ).toBe(Date.parse("2026-11-02T06:30:00Z"));
  expect(
    nextOccurrence(
      { kind: "weekly", weekday: 1, time: "09:00", timezone: "Asia/Riyadh" },
      Date.parse("2026-11-16T06:00:00Z"),
    ),
  ).toBe(Date.parse("2026-11-23T06:00:00Z"));
});
test("time dispatch is consumed durably, overlap skips, completion requires review", () =>
  fixture(async (s, e) => {
    const a = (await s.put(input)).automations[0]!;
    e.now += 60000;
    await s.tick();
    expect(e.dispatched).toHaveLength(1);
    await s.runNow(a.id);
    expect((await s.snapshot()).runs.at(-1)?.status).toBe("skipped");
    await s.outcome(e.dispatched[0]!, false, "Review required");
    expect((await s.snapshot()).runs[0]?.status).toBe("needs-review");
    const restarted = new AutomationService(e.file, e.adapter, () => e.now);
    await restarted.tick();
    expect(e.dispatched).toHaveLength(1);
  }));
test("sleep misses are skipped, never burst replayed", () =>
  fixture(async (s, e) => {
    await s.put(input);
    e.now += 3 * 86400000;
    await s.tick();
    expect(e.dispatched).toHaveLength(0);
    expect((await s.snapshot()).runs[0]?.status).toBe("skipped");
  }));
test("GitHub baseline, new revision, restart dedup and context", () =>
  fixture(async (s, e) => {
    e.events = [{ key: "old", context: "commit old" }];
    await s.put({
      ...input,
      trigger: {
        kind: "github",
        repository: "owner/repo",
        target: "4",
        failedChecks: true,
        reviews: true,
      },
    });
    await s.tick();
    expect(e.dispatched).toHaveLength(0);
    e.now += 120000;
    e.events.push({ key: "new", context: "commit exact check URL" });
    await s.tick();
    expect(e.dispatched).toHaveLength(1);
    expect((await s.snapshot()).runs[0]?.context).toBe(
      "commit exact check URL",
    );
    const restarted = new AutomationService(
      e.file,
      e.adapter,
      () => e.now + 120000,
    );
    await restarted.tick();
    expect(e.dispatched).toHaveLength(1);
    expect((await restarted.snapshot()).runs[0]?.status).toBe("interrupted");
  }));
test("three failures pause with no model substitution", () =>
  fixture(async (s, e) => {
    e.adapter.dispatch = async () => {
      throw new Error("Exact model unavailable");
    };
    const a = (await s.put(input)).automations[0]!;
    for (let i = 0; i < 3; i++) await s.runNow(a.id);
    const state = await s.snapshot();
    expect(state.automations[0]?.input.enabled).toBe(false);
    expect(state.runs.map((r) => r.status)).toEqual([
      "failed",
      "failed",
      "failed",
    ]);
  }));
test("Stop during preparation fences dispatch and retains transcript", () =>
  fixture(async (s, e) => {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((r) => (entered = r)),
      gate = new Promise<void>((r) => (release = r));
    e.adapter.prepare = async (_, id) => {
      entered();
      await gate;
      return { id, cwd: "/project", file: `/sessions/${id}` };
    };
    const a = (await s.put(input)).automations[0]!;
    const running = s.runNow(a.id);
    await enteredPromise;
    const stopped = s.stop(a.id);
    release();
    await stopped;
    await running;
    expect(e.dispatched).toHaveLength(0);
    const run = (await s.snapshot()).runs[0]!;
    expect(run.status).toBe("stopped");
    expect(run.ref?.file).toStartWith("/sessions/");
  }));
test("Stop invalidates an in-flight event poll before allocation", () =>
  fixture(async (s, e) => {
    const a = (
      await s.put({
        ...input,
        trigger: {
          kind: "github",
          repository: "owner/repo",
          target: "4",
          failedChecks: true,
          reviews: true,
        },
      })
    ).automations[0]!;
    await s.tick();
    e.now += 120000;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      arrived = new Promise<void>((r) => (entered = r));
    e.adapter.events = async () => {
      entered();
      await gate;
      return [{ key: "new", context: "exact revision" }];
    };
    const polling = s.tick();
    await arrived;
    await s.stop(a.id);
    release();
    await polling;
    expect(e.dispatched).toHaveLength(0);
    e.now += 120000;
    await s.tick();
    expect(e.dispatched).toHaveLength(0);
  }));
