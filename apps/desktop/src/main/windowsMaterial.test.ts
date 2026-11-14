import { expect, mock, test } from "bun:test";

const nativeCall = mock(() => 1);
const decode = mock(() => 0x1234n);
const struct = mock();
const func = mock(() => nativeCall);
const load = mock(() => ({ func }));
mock.module("node:module", () => ({ createRequire: () => () => ({ load, struct, decode }) }));
const { setWindowsMaterialActive } = await import("./windowsMaterial.ts");

test("Windows composition receives the HWND and a four-byte active appearance flag", () => {
  const handle = Buffer.alloc(8);
  handle.writeBigUInt64LE(0x1234n);
  setWindowsMaterialActive(handle, true);
  expect(load).toHaveBeenCalledWith("user32.dll");
  expect(func).toHaveBeenCalledWith(expect.stringContaining("__stdcall SetWindowCompositionAttribute"));
  expect(struct).toHaveBeenCalledWith("NativePiWindowCompositionAttributeData", {
    attribute: "int32_t", data: "void *", size: "size_t",
  });
  expect(decode).toHaveBeenCalledWith(handle, "void *");
  expect(nativeCall).toHaveBeenLastCalledWith(0x1234n, {
    attribute: 15, data: Buffer.from([1, 0, 0, 0]), size: 4,
  });
  // Switching away from glass must restore Windows' normal inactive appearance.
  setWindowsMaterialActive(handle, false);
  expect(nativeCall).toHaveBeenLastCalledWith(0x1234n, {
    attribute: 15, data: Buffer.alloc(4), size: 4,
  });
  expect(load).toHaveBeenCalledTimes(1);
});

test("a rejected composition attribute falls back without failing theme updates or repeated warnings", () => {
  const originalWarn = console.warn;
  const warn = mock();
  console.warn = warn;
  try {
    nativeCall.mockReturnValue(0);
    const calls = nativeCall.mock.calls.length;
    expect(() => setWindowsMaterialActive(Buffer.alloc(8), true)).not.toThrow();
    setWindowsMaterialActive(Buffer.alloc(8), false);
    expect(nativeCall).toHaveBeenCalledTimes(calls + 1);
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    console.warn = originalWarn;
  }
});
