import { useFormDrafts } from "../lib/formDrafts.ts";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import TaskWorkspacePanel from "./TaskWorkspacePanel.tsx";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root; let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); useFormDrafts.setState({ values: {} }); });
const listing = { recipe: { setup: "echo setup", run: "echo run", check: "echo check" }, worktrees: [{ path: "/repo", branch: "main", main: true }, { path: "/task", branch: "feature", main: false, managed: { path: "/task", repository: "/repo", branch: "feature", base: "abc", owner: "chat", status: "created", output: "" } }] };
function button(text: string) { return [...document.querySelectorAll("button")].find(b => b.textContent === text)!; }
async function mount(start: (path: string) => Promise<void>, projectDir = "/repo") { container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(<TaskWorkspacePanel projectDir={projectDir} onStart={start} />)); }
test("shared checkout remains deliberate and isolation sends explicit branch and base", async () => {
  let started = ""; const created: unknown[] = [];
  stubInvoke(async (name, params) => { if (name === "taskWorkspaceList") return listing; if (name === "taskWorkspaceCreate") { created.push(params); return { path: "/task" }; } return {}; });
  await mount(async cwd => { started = cwd; });
  await act(async () => button("Start chat here").click()); expect(started).toBe("/repo");
  await act(async () => button("Separate workspace").click());
  await act(async () => button("Branch options").click());
  const inputs = container.querySelectorAll("input");
  await act(async () => { for (const [i, value] of ["feature", "origin/main"].entries()) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[i], value); inputs[i]!.dispatchEvent(new Event("input", { bubbles: true })); inputs[i]!.dispatchEvent(new Event("change", { bubbles: true })); } });
  await act(async () => button("Create workspace").click());
  expect(created).toEqual([{ projectDir: "/repo", branch: "feature", base: "origin/main" }]);
  await act(async () => button("Start chat here").click()); expect(started).toBe("/task");
});
test("execution requires consent and retirement displays host blockers without deleting", async () => {
  const actions: unknown[] = [];
  stubInvoke(async (name, params) => { if (name === "taskWorkspaceList") return listing; if (name === "taskWorkspaceAction") { actions.push(params); return { blockers: ["Active agent"] }; } return {}; });
  await mount(async () => {});
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Workspace"]')!.click());
  await act(async () => ([...document.querySelectorAll('[role="option"]')].find(el => el.textContent === "feature") as HTMLElement).click());
  expect(button("Prepare").disabled).toBe(true);
  await act(async () => (container.querySelector('[role="checkbox"]') as HTMLElement).click());
  await act(async () => button("Prepare").click());
  expect(actions[0]).toEqual({ projectDir: "/task", action: "setup", confirmed: true, copyFiles: [] });
  await act(async () => button("Remove workspace…").click()); expect(container.textContent).toContain("Active agent");
  expect(button("Remove workspace folder")).toBeUndefined();
});


test("retiring the current worktree keeps the panel and next chat on the surviving project", async () => {
  let removed = false; let started = "";
  stubInvoke(async (name, params) => {
    const p = params as any;
    if (name === "taskWorkspaceList") {
      if (removed && p.projectDir === "/task") throw new Error("Folder was removed");
      return removed ? { ...listing, worktrees: listing.worktrees.slice(0, 1) } : listing;
    }
    if (name === "taskWorkspaceAction") { if (p.action === "remove") removed = true; return { blockers: [] }; }
    return {};
  });
  await mount(async path => { started = path; }, "/task");
  await act(async () => button("Remove workspace…").click());
  await act(async () => button("Remove workspace folder").click());
  await act(async () => button("Start chat here").click());
  expect(removed).toBe(true); expect(started).toBe("/repo");
  expect(container.textContent).not.toContain("Folder was removed");
});


test("unsupported folders offer ordinary work and never create an unintended shared or separate workspace", async () => {
  let started="";
  stubInvoke(async name => {if(name==="taskWorkspaceCreate") throw Error("Must not create here");return {supported:false,recipe:{setup:"",run:"",check:""},worktrees:[]};});
  await mount(async path=>{started=path;},"/ordinary-folder");
  await act(async()=>button("Separate workspace").click());
  expect(container.textContent).toContain("Separate workspaces need a Git project");
  expect(button("Create workspace")).toBeUndefined();
  await act(async()=>button("Use current folder").click());
  await act(async()=>button("Start chat here").click());
  expect(started).toBe("/ordinary-folder");
});
test("a failed inventory keeps creation unavailable, then retry uses retained branch choices", async () => {
  let failed=true;let created:any;
  stubInvoke(async(name,params)=>{if(name==="taskWorkspaceList"){if(failed)throw Error("Inventory offline");return listing;}if(name==="taskWorkspaceCreate"){created=params;return {path:"/task"};}return {};});
  await mount(async()=>{});
  await act(async()=>button("Separate workspace").click());
  expect(button("Create workspace").disabled).toBe(true);
  failed=false; await act(async()=>button("Try again").click());
  expect(button("Create workspace").disabled).toBe(false);
  await act(async()=>button("Create workspace").click());
  expect(created).toMatchObject({projectDir:"/repo",base:"HEAD"});
  expect(created.branch).toMatch(/^task\/work-/);
});
test("project action instructions survive leaving the dialog and a saved draft does not mask future server changes",async()=>{
  let recipe={...listing.recipe};
  stubInvoke(async(name,params:any)=>{if(name==="taskWorkspaceList")return {...listing,recipe};if(name==="taskWorkspaceRecipe"){recipe=params.recipe;return {ok:true};}return {};});
  const show=async()=>{await act(async()=>[...container.querySelectorAll("summary")].find(s=>s.textContent?.includes("Prepare & run"))!.click());await act(async()=>button("Project actions").click());};
  await mount(async()=>{});await show();
  const input=document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,"echo retained setup");input.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>root.unmount());container.remove();
  await mount(async()=>{});await show();
  expect(document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!.value).toBe("echo retained setup");
  await act(async()=>button("Save actions").click());recipe={...recipe,setup:"echo changed elsewhere"};
  await act(async()=>root.unmount());container.remove();
  await mount(async()=>{});await show();
  expect(document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!.value).toBe("echo changed elsewhere");
});
