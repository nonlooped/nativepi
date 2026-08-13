import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import AppBoundary from "./components/AppBoundary.tsx";
import { isDesktopShell, osName } from "./lib/platform.ts";
import { rpc } from "./lib/rpc.ts";

// Whether this document is the frameless Electron window or a browser tab on
// someone's phone. Written before the first paint so no frame ever reserves
// space for window controls that are not there.
document.documentElement.dataset.shell = isDesktopShell ? "desktop" : "web";
if (isDesktopShell) {
  document.documentElement.dataset.windowControls = osName() === "macOS" ? "native" : "custom";
}
if (__NATIVEPI_DEV_GENERATION__) {
  document.documentElement.dataset.runtime = "development";
  document.title = `NativePi [DEV ${__NATIVEPI_DEV_GENERATION__.slice(0, 6)}]`;
}

if (isDesktopShell) {
  window.addEventListener("error", (event) => {
    void rpc.request.reportRendererError({
      kind: "error",
      message: event.message || "Unknown renderer error",
      stack: event.error instanceof Error ? event.error.stack : undefined,
    }).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    void rpc.request.reportRendererError({
      kind: "unhandledRejection",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }).catch(() => {});
  });
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
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
