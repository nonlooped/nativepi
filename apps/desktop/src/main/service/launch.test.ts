import { expect, mock, test } from "bun:test";

let options: { env: NodeJS.ProcessEnv } | undefined;
mock.module("electron", () => ({ app: { isPackaged: true } }));
mock.module("node:child_process", () => ({ spawn: (_executable: string, _args: string[], value: typeof options) => {
  options = value;
  return { on() {}, unref() {} };
} }));
const { launchHost } = await import("./lifecycle.ts");

test("background Electron starts without inheriting Node mode", () => {
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  try {
    process.env.ELECTRON_RUN_AS_NODE = "1";
    launchHost("data");
    expect(options?.env).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
  } finally {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previous;
  }
});
