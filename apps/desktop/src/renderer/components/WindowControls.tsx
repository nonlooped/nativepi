import { useEffect, useState } from "react";
import { isRemote, rpc } from "../lib/rpc.ts";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";

export default function WindowControls() {
  if (isRemote) return null;
  return <DesktopWindowControls />;
}

function DesktopWindowControls() {
  const [maximized, setMaximized] = useState(false);

  // Not a useRequest: the initial read is only the seed for a value the main
  // process then pushes on every maximize/unmaximize, so the subscription — not
  // the request — is what this effect exists for.
  useEffect(() => {
    let cancelled = false;
    void rpc.request.windowIsMaximized({}).then((r) => {
      if (!cancelled) setMaximized(r.maximized);
    });
    const off = rpc.events.on("windowMaximized", ({ maximized: next }) => {
      if (!cancelled) setMaximized(next);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return (
    // z-[60] deliberately clears the z-50 dialog/sheet/menu layer: in a
    // frameless window, a modal must never cover the close button.
    <div className={cn("absolute top-0 right-0 z-[60] flex h-12 items-stretch bg-transparent", NO_DRAG_REGION)}>
      <ControlButton label="Minimize" onClick={() => void rpc.request.windowMinimize({})}>
        <MinimizeGlyph />
      </ControlButton>
      <ControlButton
        label={maximized ? "Restore" : "Maximize"}
        onClick={() => void rpc.request.windowToggleMaximize({}).then((r) => setMaximized(r.maximized))}
      >
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </ControlButton>
      <ControlButton
        label="Close"
        onClick={() => void rpc.request.windowClose({})}
        className="hover:bg-destructive hover:text-bright"
      >
        <CloseGlyph />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid w-11 place-items-center text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
    >
      {children}
    </button>
  );
}

const glyphProps = {
  width: 10,
  height: 10,
  viewBox: "0 0 10 10",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  shapeRendering: "crispEdges" as const,
  "aria-hidden": true,
};

function MinimizeGlyph() {
  return (
    <svg {...glyphProps}>
      <line x1="0.5" y1="5" x2="9.5" y2="5" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg {...glyphProps}>
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg {...glyphProps}>
      <rect x="0.5" y="2.5" width="7" height="7" />
      <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg {...glyphProps}>
      <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
      <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
    </svg>
  );
}
