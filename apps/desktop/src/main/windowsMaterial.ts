import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let setActiveAppearance: ((handle: Buffer, active: boolean) => void) | null | undefined;

/** Windows has no Electron equivalent of macOS's visualEffectState: active.
 * Keep this compatibility attribute isolated: it changes appearance, never focus.
 * If Windows rejects it, retain Electron's ordinary system-managed Acrylic. */
export function setWindowsMaterialActive(handle: Buffer, active: boolean): void {
  if (setActiveAppearance === null || (!active && setActiveAppearance === undefined)) return;
  try {
    if (!setActiveAppearance) {
      // Load native code only on Windows, when the main window needs Acrylic.
      const koffi: typeof import("koffi") = require("koffi");
      koffi.struct("NativePiWindowCompositionAttributeData", {
        attribute: "int32_t",
        data: "void *",
        size: "size_t",
      });
      const setAttribute = koffi.load("user32.dll").func(
        "int __stdcall SetWindowCompositionAttribute(void *hwnd, const NativePiWindowCompositionAttributeData *data)",
      );
      setActiveAppearance = (handle, active) => {
        const value = Buffer.alloc(4);
        value.writeInt32LE(active ? 1 : 0);
        // Electron returns the HWND's bytes, not a pointer to the HWND.
        const hwnd = koffi.decode(handle, "void *");
        // WCA_FORCE_ACTIVEWINDOW_APPEARANCE is a private composition attribute.
        if (!setAttribute(hwnd, { attribute: 15, data: value, size: value.length })) {
          throw new Error("Windows rejected the active material appearance");
        }
      };
    }
    setActiveAppearance(handle, active);
  } catch (error) {
    setActiveAppearance = null;
    console.warn("Could not retain inactive-window Acrylic; using the system material.", error);
  }
}
