import { useAppStore } from "./store.ts";

export function workspaceShortcutsBlocked(allowedSheet?: "sidebar" | "context") {
  const state = useAppStore.getState();
  return state.settingsOpen
    || [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(dialog =>
      !allowedSheet || !dialog.querySelector(allowedSheet === "sidebar" ? ".sidebar-panel" : ".context-pane"))
    || state.extSurfaces.some(surface => surface.placement === "editor" || surface.placement === "overlay");
}
