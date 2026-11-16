import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFormDrafts } from "../../lib/formDrafts.ts";
import type {
  AutomationState,
  AutomationInput,
} from "../../../shared/automations.ts";
const id = "11111111-1111-4111-8111-111111111111";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let state: AutomationState;
let read: (() => Promise<AutomationState>) | undefined;
let saved: AutomationInput | undefined;
mock.module("../../lib/rpc.ts", () => ({
  isRemote: false,
  rpc: {
    events: { on: () => () => {} },
    request: {
      automationList: async () => (read ? read() : state),
      automationGithubStatus: async () => ({ state: "ready", account: "sample-account" }),
      getChatTitleModels: async () => ({
        models: [
          {
            provider: "p",
            id: "chosen",
            name: "Chosen model",
            thinkingLevels: ["off", "high"],
            tiers: ["default", "priority"],
          },
        ],
      }),
      automationTools: async () => [
        { name: "read", description: "Read files" },
        { name: "edit", description: "Edit files" },
      ],
      automationSave: async (input: AutomationInput) => {
        saved = input;
        state = {
          ...state,
          automations: state.automations.map((a) => ({ ...a, input })),
        };
        return state;
      },
      automationStop: async () => {
        state = { ...state, runs: state.runs.map(run => run.status === "dispatched" ? { ...run, status: "stopped", ended: 3 } : run) };
        return state;
      },
      automationDelete: async () => {
        state = { ...state, automations: [] };
        return state;
      },
    },
  },
}));
const { default: AutomationSettings } =
  await import("./AutomationSettings.tsx");
let root: Root | undefined, container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  read = undefined;
  saved = undefined;
  useFormDrafts.setState({ values: {} });
  container?.remove();
});
test("pause updates the displayed persisted state and delete retains run history", async () => {
  state = {
    version: 1,
    automations: [
      {
        id,
        input: {
          id,
          name: "Daily inspection",
          prompt: "Inspect",
          enabled: true,
          project: null,
          workspace: "shared",
          configuration: {
            provider: "test",
            model: "exact",
            reasoning: "off",
            tools: ["read"],
          },
          trigger: { kind: "once", at: "2026-12-01T00:00:00Z" },
        },
        next: 1796083200000,
        seen: [],
        initialized: false,
        failures: 0,
        lastPoll: 0,
      },
    ],
    runs: [
      {
        id,
        automationId: id,
        name: "Daily inspection",
        started: 1,
        status: "failed",
        detail: "Exact model unavailable",
        context: "Manual run",
      },
    ],
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<AutomationSettings />));
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === name,
    )!;
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="switch"]')!.click(),
  );
  expect(container.textContent).toContain("Paused");
  expect(
    container.querySelector('[aria-label="Enable Daily inspection"]'),
  ).not.toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Actions for Daily inspection"]',
      )!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((b) => b.textContent === "Delete")!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Delete automation")!
      .click(),
  );
  expect(container.textContent).not.toContain("Edit");
  await act(async () => button("All run history").click());
  expect(document.body.textContent).toContain("Exact model unavailable");
});

test("a deferred list shows loading, a read failure offers retry, and retry recovers", async () => {
  const pending = Promise.withResolvers<AutomationState>();
  read = () => pending.promise;
  state = { version: 1, automations: [], runs: [] };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<AutomationSettings />));
  expect(container.textContent).toContain("Loading automations");
  await act(async () => {
    pending.reject(new Error("Offline"));
    await Promise.resolve();
  });
  expect(container.textContent).toContain("Could not load automations");
  read = async () => state;
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Try again")!
      .click(),
  );
  expect(container.textContent).toContain("No automations yet");
});

test("editor saves catalog model/reasoning/speed choices without changing the manual chat", async () => {
  const { default: AutomationEditor } = await import("./AutomationEditor.tsx");
  const { useAppStore } = await import("../../lib/store.ts");
  const manual = { provider: "manual", id: "unchanged", name: "Manual model" };
  useAppStore.setState({
    model: manual,
    modelsError: "Manual catalog unavailable",
    thinkingLevelsError: "Manual levels unavailable",
    projects: [],
    providers: [],
    favoriteModels: [],
  });
  const initial: AutomationInput = {
    name: "Inspect",
    prompt: "Read only",
    enabled: false,
    project: null,
    workspace: "shared",
    configuration: {
      provider: "old",
      model: "unavailable",
      reasoning: "off",
      tools: ["read"],
    },
    trigger: { kind: "daily", time: "09:00", timezone: "UTC" },
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <AutomationEditor
        initial={initial}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    ),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "GitHub")!
      .click(),
  );
  expect(document.querySelector('[aria-label="Repeat"]')).toBeNull();
  expect(
    document.querySelector<HTMLInputElement>("#automation-instructions")?.value,
  ).toBe("Read only");
  expect(document.querySelector("#automation-repo")).not.toBeNull();
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Schedule")!
      .click(),
  );
  expect(document.querySelector("#automation-repo")).toBeNull();
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>("[data-model-picker-trigger]")!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>("[data-model-choice]")]
      .find((b) => b.textContent?.includes("Chosen model"))!
      .click(),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Reasoning effort"]')!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((b) => b.textContent === "High")!
      .click(),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Service tier"]')!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((b) => b.textContent?.includes("Priority"))!
      .click(),
  );
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await act(async () =>
    document
      .querySelector<HTMLFormElement>("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(saved?.configuration).toEqual({
    provider: "p",
    model: "chosen",
    reasoning: "high",
    tier: "priority",
    tools: ["read"],
  });
  expect(useAppStore.getState().model).toEqual(manual);
});


test("an overlap skip does not hide the active run or its Stop action", async () => {
  state = { version: 1, automations: [{ id, input: { id, name: "Active work", prompt: "Inspect", enabled: true, project: null, workspace: "shared", configuration: { provider: "test", model: "exact", reasoning: "off", tools: ["read"] }, trigger: { kind: "once", at: "2026-12-01T00:00:00Z" } }, next: null, seen: [], initialized: false, failures: 0, lastPoll: 0 }], runs: [
    { id, automationId: id, name: "Active work", started: 1, status: "dispatched", detail: "Running", context: "Manual" },
    { id: "22222222-2222-4222-8222-222222222222", automationId: id, name: "Active work", started: 2, ended: 2, status: "skipped", detail: "Overlap", context: "Manual" },
  ] };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<AutomationSettings />));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Actions for Active work"]')!.click());
  const stop = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(button => button.textContent === "Stop run");
  expect(stop).toBeDefined();
  await act(async () => stop!.click());
  expect(state.runs[0]!.status).toBe("stopped");
  expect(container.textContent).not.toContain("Stop run");
});

async function fill(id: string, value: string) {
  await act(async () => {
    const input = document.getElementById(id)!;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("a new automation reuses the available chat model and keeps unsaved instructions across navigation", async () => {
  const { default: AutomationEditor } = await import("./AutomationEditor.tsx");
  const { useAppStore } = await import("../../lib/store.ts");
  useAppStore.setState({ model: { provider: "p", id: "chosen", name: "Chosen model" } as any, thinkingLevel: "high", serviceTier: { tier: "priority", tiers: ["default", "priority"] }, projects: [], workRoot: "/work" });
  state = { version: 1, automations: [], runs: [] };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const editor = <AutomationEditor initial="new" onClose={() => {}} onSaved={() => {}} />;
  await act(async () => root!.render(editor));
  await fill("automation-name", "Check the report");
  await fill("automation-instructions", "Review the report and keep my notes");
  expect(document.body.textContent).toContain("Can change files and run programs");
  await act(async () => root!.render(<p>Another settings page</p>));
  await act(async () => root!.render(editor));
  expect(document.querySelector<HTMLTextAreaElement>("#automation-instructions")?.value).toBe("Review the report and keep my notes");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(saved?.configuration).toEqual({ provider: "p", model: "chosen", reasoning: "high", tier: "priority", tools: ["read", "bash", "edit", "write"] });
  await act(async () => root!.render(<p>Elsewhere</p>));
  await act(async () => root!.render(editor));
  expect(document.querySelector<HTMLInputElement>("#automation-name")?.value).toBe("");
});

test("GitHub trigger corrections name the invalid fields and a pasted link selects the repository and request", async () => {
  const { default: AutomationEditor } = await import("./AutomationEditor.tsx");
  state = { version: 1, automations: [], runs: [] };
  const initial: AutomationInput = { name: "Watch review", prompt: "Read feedback", project: null, enabled: false, workspace: "shared", configuration: { provider: "p", model: "chosen", reasoning: "off", tools: ["read"] }, trigger: { kind: "github", repository: "invalid", target: "", failedChecks: false, reviews: false } };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<AutomationEditor initial={initial} onClose={() => {}} onSaved={() => {}} />));
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.body.textContent).toContain("Use owner/repository");
  expect(document.body.textContent).toContain("Turn on failed checks or review feedback");
  expect(saved).toBeUndefined();
  await fill("automation-pr", "https://github.com/team/project/pull/42");
  expect(document.querySelector<HTMLInputElement>("#automation-repo")?.value).toBe("team/project");
  await act(async () => document.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(saved?.trigger).toEqual({ kind: "github", repository: "team/project", target: "42", failedChecks: true, reviews: false });
});
