import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  AutomationState,
  AutomationInput,
} from "../../../shared/automations.ts";
const id = "11111111-1111-4111-8111-111111111111";
let state: AutomationState;
mock.module("../../lib/rpc.ts", () => ({
  isRemote: false,
  rpc: {
    events: { on: () => () => {} },
    request: {
      automationList: async () => state,
      automationSave: async (input: AutomationInput) => {
        state = {
          ...state,
          automations: state.automations.map((a) => ({ ...a, input })),
        };
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
  await act(async () => button("Pause").click());
  expect(container.textContent).toContain("Paused");
  expect(button("Enable")).toBeDefined();
  await act(async () => button("Delete").click());
  expect(container.textContent).not.toContain("Edit");
  expect(container.textContent).toContain("Exact model unavailable");
});
