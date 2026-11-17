import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { browserChromeActionSchema } from "../../shared/browser.ts";
import { applyBrowserTheme } from "./theme.ts";

type Action = z.infer<typeof browserChromeActionSchema>;
type PickerBridge = {
  invoke(action: Action): Promise<unknown>;
  onTheme(listener: (raw: unknown) => void): () => void;
};
const resultSchema = z.object({
  error: z.string().max(4000).optional(),
  bounds: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().nonnegative().finite(), height: z.number().nonnegative().finite() }).optional(),
});
const instruction = "Click an element · Esc to cancel";

/** The app-owned native input shield. The remote page receives no picking input. */
export default function ElementPicker({ bridge }: { bridge: PickerBridge }) {
  const [target, setTarget] = useState<z.infer<typeof resultSchema>>({});
  const busy = useRef(false);
  useEffect(() => {
    const stopTheme = bridge.onTheme(applyBrowserTheme);
    const key = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === "Escape") void bridge.invoke({ action: "cancelAnnotation" });
    };
    window.addEventListener("keydown", key);
    void bridge.invoke({ action: "state" });
    return () => { stopTheme(); window.removeEventListener("keydown", key); };
  }, [bridge]);
  const inspect = async (x: number, y: number, capture: boolean) => {
    const result = resultSchema.safeParse(await bridge.invoke({ action: "annotationPoint", x: Math.round(x), y: Math.round(y), capture }));
    if (result.success) setTarget(result.data);
  };
  return (
    <div
      data-browser-element-picker=""
      className="relative h-full w-full cursor-crosshair select-none font-sans"
      onPointerMove={async event => {
        if (busy.current) return;
        busy.current = true;
        try { await inspect(event.clientX, event.clientY, false); }
        finally { busy.current = false; }
      }}
      onClick={event => { event.preventDefault(); void inspect(event.clientX, event.clientY, true); }}
      onContextMenu={event => event.preventDefault()}
    >
      {target.bounds ? <div aria-hidden="true" className="pointer-events-none absolute border-2 border-ring bg-ring/8" style={{ left: target.bounds.x, top: target.bounds.y, width: target.bounds.width, height: target.bounds.height }} /> : null}
      <div role="status" className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md border bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-md">
        {target.error || instruction}
      </div>
    </div>
  );
}
