import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { isDesktopShell } from "./lib/platform.ts";

// Whether this document is the frameless Electron window or a browser tab on
// someone's phone. Written before the first paint so no frame ever reserves
// space for window controls that are not there.
document.documentElement.dataset.shell = isDesktopShell ? "desktop" : "web";
if (__NATIVEPI_DEV_GENERATION__) {
  document.documentElement.dataset.runtime = "development";
  document.title = `NativePi [DEV ${__NATIVEPI_DEV_GENERATION__.slice(0, 6)}]`;
}

// The soft keyboard shrinks the visual viewport without shrinking the layout
// viewport, so a full-height shell keeps its bottom — the composer — underneath
// the keyboard. Tracking the visual viewport is what puts it back on screen.
const viewport = window.visualViewport;
if (viewport) {
  const apply = () => {
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
    // iOS also scrolls the document itself to reveal the focused field. The
    // shell is already the exact height of what is visible, so that scroll only
    // pushes the header off the top.
    window.scrollTo(0, 0);
  };
  viewport.addEventListener("resize", apply);
  // The window event as well as the visual one: this variable is now the app's
  // only height, so a resize that somehow does not reach the visual viewport
  // would leave the desktop window rendering at its previous size.
  window.addEventListener("resize", apply);
  apply();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
