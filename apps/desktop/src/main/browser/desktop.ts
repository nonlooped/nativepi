import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import { z } from "zod";
import { SharedBrowser } from "./index.ts";
import type { browserRelaySchema } from "../../shared/background-service.ts";
const boundsSchema = z.object({ id: z.string().uuid(), bounds: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().positive().max(16000), height: z.number().int().positive().max(16000) }).optional() });
const browsers = new Map<string, { browser: SharedBrowser; window: BrowserWindow }>();
let active: string | undefined;
ipcMain.handle("nativepi:browser-panel", (event, raw: unknown) => {
  if (event.senderFrame !== event.sender.mainFrame) return;
  const { id, bounds } = boundsSchema.parse(raw);
  const entry = browsers.get(id);
  if (entry?.window.webContents === event.sender) entry.browser.setBounds(bounds);
});
export async function desktopBrowserCommand(command: z.infer<typeof browserRelaySchema>) {
  let entry = browsers.get(command.browser);
  if (!entry) {
    if (command.method === "dispose" || command.method === "cancel") return;
    const window = BrowserWindow.getAllWindows().find(win => !win.isDestroyed());
    if (!window) throw new Error("Open NativePi to use the browser.");
    const id = command.browser;
    const browser = new SharedBrowser(window, () => {
      if (active && active !== id) browsers.get(active)?.browser.setBounds();
      active = id;
      window.webContents.send("nativepi:browser-panel", id);
    }, () => {
      browser.setBounds();
      if (active === id) { active = undefined; window.webContents.send("nativepi:browser-panel", null); }
    });
    entry = { browser, window }; browsers.set(id, entry);
    window.once("closed", () => { browser.dispose(); browsers.delete(id); });
  }
  const browser = entry.browser;
  if (command.ownerTitle) browser.setOwner(command.ownerTitle);
  if (command.preferences) browser.preferences = command.preferences;
  switch (command.method) {
    case "setOwner": browser.setOwner(z.string().max(200).parse(command.input)); return;
    case "run": return browser.run(command.input);
    case "chrome": return browser.chrome(command.input);
    case "show": browser.show(); return;
    case "cancel": browser.cancel(); return;
    case "dispose": browser.dispose(); browsers.delete(command.browser); if (active === command.browser) { active = undefined; entry.window.webContents.send("nativepi:browser-panel", null); } return;
  }
}

export async function updateBrowserPreferences(preferences: import("../../shared/rpc-schema.ts").Preferences) {
  await Promise.all([...browsers.values()].map(async ({ browser }) => {
    browser.preferences = preferences;
    await browser.chrome({ action: "state" });
  }));
}

nativeTheme.on("updated", () => {
  for (const { browser } of browsers.values()) void browser.chrome({ action: "state" }).catch(() => {});
});
