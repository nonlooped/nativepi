import { BrowserWindow, nativeTheme, session } from "electron";
import { randomUUID } from "node:crypto";
import {
  MAX_ARTIFACT_HEIGHT, artifactFrameMessageSchema, artifactPreviewInputSchema,
  artifactPreviewResultSchema, htmlArtifactDocument,
  type ArtifactPreviewInput, type ArtifactPreviewResult,
} from "../shared/htmlArtifacts.ts";
import { themeCssProperties } from "../shared/themeCss.ts";
import { builtInTheme, NATIVE_THEME } from "../shared/themes.ts";
import { loadState } from "./state.ts";

let activePreviews = 0;

/** A disposable, network-denied Chromium context. Never uses the app's session or preload. */
export async function previewHtmlArtifact(value: ArtifactPreviewInput, signal: AbortSignal): Promise<ArtifactPreviewResult> {
  const input = artifactPreviewInputSchema.parse(value);
  signal.throwIfAborted();
  if (activePreviews >= 2) throw new Error("Two HTML previews are already running. Retry after they finish.");
  activePreviews++;
  let win: BrowserWindow | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const { preferences } = await loadState();
    signal.throwIfAborted();
    const appearance = input.appearance ?? (preferences.theme === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : preferences.theme);
    const scheme = preferences.customThemes.find(theme => theme.id === preferences.themeId)
      ?? builtInTheme(preferences.themeId)?.theme ?? NATIVE_THEME;
    const colors = scheme.colors[appearance];
    const html = htmlArtifactDocument(input.html, { appearance, variables: {
      ...themeCssProperties(colors), "--radius": "0.625rem",
      "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      "--font-mono": '"SFMono-Regular", Consolas, monospace',
    } });
    const isolated = session.fromPartition(`nativepi-artifact-${randomUUID()}`, { cache: false });
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(?:data:|about:blank$)/.test(details.url) }));
    isolated.on("will-download", event => event.preventDefault());
    win = new BrowserWindow({
      width: input.width, height: 600, useContentSize: true, show: false,
      backgroundColor: colors.background,
      webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, disableDialogs: true },
    });
    const window = win;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("will-frame-navigate", event => event.preventDefault());
    const run = async () => {
      // Parent receives only measurements and console output from its opaque child.
      const wrapper = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${colors.background}}iframe{display:block;border:0;width:100%;height:600px}</style></head><body><iframe sandbox="allow-scripts" srcdoc="${html.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></iframe></body></html>`;
      // Attach before loading the child so early console errors are retained.
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wrapper.replace("<iframe", `<script>globalThis.preview={height:0,logs:[]};addEventListener('message',e=>{if(e.source!==document.querySelector('iframe')?.contentWindow)return;const d=e.data;if(d?.type==='nativepi.artifact.size'&&Number.isFinite(d.height)&&d.height>0){preview.height=d.height;document.querySelector('iframe').style.height=Math.min(${MAX_ARTIFACT_HEIGHT},d.height)+'px'}if(d?.type==='nativepi.artifact.console'&&preview.logs.length<50)preview.logs.push(d)});</script><iframe`))}`);
      const data = await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=Date.now();let last=0,stable=0;const tick=()=>{const p=globalThis.preview;if(p.height&&p.height===last)stable++;else stable=0;last=p.height;if(stable>=3)return resolve(p);if(Date.now()-start>6000)return p.height?resolve(p):reject(new Error('The artifact did not report its size.'));setTimeout(tick,100)};tick()})`) as { height: number; logs: unknown[] };
      signal.throwIfAborted();
      const contentHeight = Math.max(80, Math.ceil(data.height));
      const capturedHeight = Math.min(MAX_ARTIFACT_HEIGHT, contentHeight);
      window.setContentSize(input.width, capturedHeight);
      await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const screenshot = await window.webContents.capturePage({ x: 0, y: 0, width: input.width, height: capturedHeight }, { stayHidden: true, stayAwake: false });
      const consoleMessages = data.logs.flatMap(log => {
        const parsed = artifactFrameMessageSchema.safeParse(log);
        return parsed.success && parsed.data.type === "nativepi.artifact.console" ? [{ level: parsed.data.level, text: parsed.data.text }] : [];
      });
      return artifactPreviewResultSchema.parse({ width: input.width, contentHeight, capturedHeight, consoleMessages, png: screenshot.toPNG().toString("base64") });
    };
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error("HTML preview cancelled."));
        signal.addEventListener("abort", abort, { once: true });
        timeout = setTimeout(() => reject(new Error("HTML preview timed out.")), 15_000);
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    if (abort) signal.removeEventListener("abort", abort);
    if (win && !win.isDestroyed()) win.destroy();
    activePreviews--;
  }
}
