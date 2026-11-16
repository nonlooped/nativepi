import { afterAll, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "nativepi-login-test-"));
const originalPlatform = process.platform;
const originalXdg = process.env.XDG_CONFIG_HOME;
const originalAppImage = process.env.APPIMAGE;
process.env.XDG_CONFIG_HOME = join(root, "config");
let registered: { openAtLogin: boolean; path?: string; args?: string[] } = { openAtLogin: false };
mock.module("electron", () => ({ app: {
  isPackaged: true, getPath: () => root,
  getLoginItemSettings: (options: { path: string; args: string[] }) => ({ openAtLogin: registered.openAtLogin && registered.path === options.path && JSON.stringify(registered.args) === JSON.stringify(options.args) }),
  setLoginItemSettings: (settings: typeof registered) => { registered = settings; },
} }));
const { setLogin, loginEnabled } = await import("./lifecycle.ts");
afterAll(async () => { Object.defineProperty(process, "platform", { value: originalPlatform }); if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = originalXdg; if (originalAppImage === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = originalAppImage; await rm(root, { recursive: true, force: true }); });
test("Windows registration selects the background host arguments and can be disabled", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  await setLogin(true, root);
  expect(await loginEnabled(root)).toBe(true);
  expect(registered.args).toEqual(["--nativepi-service", `--nativepi-data-dir=${root}`]);
  expect(await loginEnabled(join(root, "other"))).toBe(false);
  await setLogin(false, root); expect(await loginEnabled(root)).toBe(false);
});
test("macOS registers a user LaunchAgent with literal escaped arguments and removal", async () => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  delete process.env.APPIMAGE;
  await setLogin(true, join(root, "data & <literal>"));
  expect(await loginEnabled(root)).toBe(true);
  const plist = await readFile(join(root, "Library", "LaunchAgents", "dev.nativepi.background.plist"), "utf8");
  expect(plist).toContain(`<string>--nativepi-data-dir=${root}/data &amp; &lt;literal&gt;</string>`);
  expect(plist).toContain("<key>RunAtLoad</key><true/>");
  expect(plist).not.toContain("KeepAlive");
  await setLogin(false, root); expect(await loginEnabled(root)).toBe(false);
});
test("Linux autostart uses the original AppImage, escapes Exec syntax and removes its entry", async () => {
  Object.defineProperty(process, "platform", { value: "linux" });
  process.env.APPIMAGE = '/tmp/NativePi 100% "literal".AppImage';
  await setLogin(true, root);
  expect(await loginEnabled(root)).toBe(true);
  const entry = await readFile(join(root, "config", "autostart", "nativepi.desktop"), "utf8");
  expect(entry).toContain('Exec="/tmp/NativePi 100%% \\"literal\\".AppImage" "--nativepi-service"');
  await setLogin(false, root); expect(await loginEnabled(root)).toBe(false);
});
