import { ipcRenderer } from "electron";
// This preload belongs solely to the trusted browser chrome, never remote pages.
window.addEventListener("DOMContentLoaded", () => {
  document.body.innerHTML = `<style>
  :root{color-scheme:light dark;font:13px system-ui}body{margin:0;background:var(--background,Canvas);color:var(--foreground,CanvasText)}header{display:flex;gap:8px;align-items:center;padding:10px}button,input,select{font:inherit;color:inherit;background:var(--surface,Field);border:1px solid var(--border,GrayText);border-radius:6px;padding:6px}input{flex:1;min-width:80px}#tabs{max-width:220px}#status{padding:0 12px;font-size:12px}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid Highlight}</style>
  <header><select id="tabs" aria-label="Browser tabs"></select><button id="back" title="Back">←</button><button id="forward" title="Forward">→</button><button id="reload">Reload</button><input id="url" aria-label="Address" placeholder="https://example.com or http://localhost:3000"><button id="go">Go</button><button id="new">New tab</button><button id="close">Close tab</button><button id="handoff">Take control</button></header><div id="status">Shared browser · temporary tabs for this Work chat</div>`;
  let active = "";
  let handoff = false;
  const input = document.querySelector<HTMLInputElement>("#url")!;
  const tabs = document.querySelector<HTMLSelectElement>("#tabs")!;
  const send = async (action: string, extra = {}) => {
    const result = await ipcRenderer.invoke("nativepi:browser-chrome", {
      action,
      tab: active || undefined,
      ...extra,
    });
    if (result?.error)
      document.querySelector("#status")!.textContent = result.error;
  };
  for (const action of ["back", "forward", "reload", "close"])
    document.getElementById(action)!.onclick = () => void send(action);
  document.getElementById("go")!.onclick = () =>
    void send(active ? "navigate" : "open", { url: input.value });
  input.onkeydown = (e) => {
    if (e.key === "Enter")
      void send(active ? "navigate" : "open", { url: input.value });
  };
  document.getElementById("new")!.onclick = () =>
    void send("open", { url: input.value || "https://example.com" });
  document.getElementById("handoff")!.onclick = () =>
    void send(handoff ? "resume" : "handoff");
  tabs.onchange = () => {
    active = tabs.value;
    void send("show");
  };
  ipcRenderer.on("nativepi:browser-state", (_e, state) => {
    tabs.replaceChildren(
      ...state.tabs.map((tab: { id: string; title: string }) => {
        const option = document.createElement("option");
        option.value = tab.id;
        option.textContent = tab.title;
        return option;
      }),
    );
    active = state.active || "";
    tabs.value = active;
    handoff = state.handoff;
    if (document.activeElement !== input) input.value = state.url || "";
    document.getElementById("handoff")!.textContent = handoff
      ? "Resume agent control"
      : "Take control";
    document.querySelector("#status")!.textContent = handoff
      ? "You have control. Complete sign-in or consent, then resume agent control."
      : "Shared with this Work chat · page content is untrusted · cookies clear when the chat runtime closes";
  });
  ipcRenderer.on("nativepi:browser-theme", (_e, theme) => {
    document.documentElement.style.colorScheme = theme.appearance;
    for (const key of ["background", "foreground", "surface", "border"])
      document.documentElement.style.setProperty("--" + key, theme.colors[key]);
  });
  void send("state");
});
