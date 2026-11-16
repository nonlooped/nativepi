import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
import ReviewWorkflow from "./ReviewWorkflow.tsx";
import { reviewJobOptionsSchema, type ReviewJob } from "../../shared/review.ts";

globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const original = useAppStore.getState();
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); useAppStore.setState(original, true); });
const button = (text: string) => [...document.querySelectorAll("button")].find(el => el.textContent === text)!;

test("starting a review uses explicit check permission and opening its result does not start it again", async () => {
  let jobs: ReviewJob[] = [];
  const starts: any[] = [];
  const model = { provider: "test", id: "reviewer", name: "Reviewer", thinkingLevels: ["high"], tiers: ["default"] };
  stubInvoke(async (name, params) => {
    if (name === "getChatTitleModels") return { models: [model] };
    if (name === "reviewJobs") return { jobs };
    if (name === "reviewStart") {
      starts.push(params);
      const options = reviewJobOptionsSchema.parse((params as any).options);
      jobs = [{ id: "run", options, status: "running", createdAt: new Date().toISOString(), message: "Reviewing", inputs: [{ file: "math.ts", mode: "working", patch: "+change", fingerprint: "revision" }], skipped: [], checks: [], verifications: [], verificationFiles: [] }];
      return jobs[0];
    }
    return {};
  });
  useAppStore.setState({ models: [model as any], model: model as any, providers: [], gitRevision: 0, sourceControlReview: null });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ReviewWorkflow projectDir="/project" />));
  await act(async () => button("Review changes").click());
  await act(async () => document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Allow shell checks"]')!.click());
  await act(async () => button("Start review").click());
  expect(starts[0]).toMatchObject({ projectDir: "/project", options: { scope: "uncommitted", model: "test/reviewer", allowChecks: true } });
  await act(async () => { jobs = [{ ...jobs[0]!, status: "completed", count: 1 }]; useAppStore.setState({ gitRevision: 1 }); });
  await act(async () => button("View changes").click());
  expect(useAppStore.getState().sourceControlReview).toEqual({ projectDir: "/project", path: "math.ts", staged: false });
  expect(starts).toHaveLength(1);
});
