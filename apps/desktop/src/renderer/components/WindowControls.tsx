import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import type { DevRuntimeStatus } from "../../shared/rpc-schema.ts";
import { devFreshness, type DevFreshness } from "../lib/devFreshness.ts";
import { osName } from "../lib/platform.ts";
import { isRemote, rpc } from "../lib/rpc.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";

const rendererDevGeneration = __NATIVEPI_DEV_GENERATION__;

export default function WindowControls() {
  if (isRemote) return null;
  return <DesktopWindowControls />;
}

function DesktopWindowControls() {
  const nativeLights = osName() === "macOS";
  const [maximized, setMaximized] = useState(false);

  // Not a useRequest: the initial read is only the seed for a value the main
  // process then pushes on every maximize/unmaximize, so the subscription — not
  // the request — is what this effect exists for.
  useEffect(() => {
    if (nativeLights) return;
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
  }, [nativeLights]);

  if (nativeLights && !rendererDevGeneration) return null;

  return (
    // z-[60] deliberately clears the z-50 dialog/sheet/menu layer: in a
    // frameless window, a modal must never cover the close button. Native
    // traffic lights are drawn by the OS above Chromium, so macOS only keeps
    // this strip for the development freshness badge.
    <div className={cn("absolute top-0 right-0 z-[60] flex h-12 items-stretch bg-transparent", NO_DRAG_REGION)}>
      {rendererDevGeneration ? <DevFreshnessIndicator /> : null}
      {nativeLights ? null : (
        <>
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
        </>
      )}
    </div>
  );
}

type IndicatorState = {
  freshness: "checking" | DevFreshness;
  runtime?: DevRuntimeStatus;
};

function DevFreshnessIndicator() {
  const [state, setState] = useState<IndicatorState>({ freshness: "checking" });

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let failures = 0;

    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const [runtime, response] = await Promise.all([
          rpc.request.devRuntimeStatus({}),
          fetch(new URL("/", window.location.href), {
            method: "HEAD",
            cache: "no-store",
            signal: AbortSignal.timeout(1_500),
          }),
        ]);
        if (!response.ok) throw new Error(`Development server returned ${response.status}.`);
        failures = 0;
        if (!cancelled) {
          setState({
            freshness: devFreshness(
              rendererDevGeneration,
              window.nativepi?.devGeneration ?? "",
              runtime,
            ),
            runtime,
          });
        }
      } catch {
        failures += 1;
        // Main and Vite both restart briefly during ordinary development. Keep
        // the last verified state through one missed check instead of flashing
        // a warning that disappears three seconds later.
        if (!cancelled && failures >= 2) setState({ freshness: "unverified" });
      } finally {
        checking = false;
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const interval = window.setInterval(() => void check(), 3_000);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  useEffect(() => {
    const label = state.freshness === "stale"
      ? "STALE"
      : state.freshness === "unverified"
        ? "DEV ?"
        : "DEV";
    document.title = `NativePi [${label} ${rendererDevGeneration.slice(0, 6)}]`;
  }, [state.freshness]);

  const details = indicatorDetails(state);
  const warning = state.freshness === "stale" || state.freshness === "unverified";
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (warning) setDismissed(false);
  }, [warning, state.freshness]);

  return (
    <>
      <div className="flex h-12 items-center px-1">
        <Badge
          variant="outline"
          title={details.title}
          className={cn(
            "px-1.5 font-mono tabular-nums",
            state.freshness === "current" && "border-success/25 bg-success/10 text-success",
            warning && "border-warning/30 bg-warning/10 text-warning",
            state.freshness === "checking" && "text-muted-foreground",
          )}
        >
          {state.freshness === "current" ? (
            <CheckCircleIcon data-icon="inline-start" weight="fill" />
          ) : warning ? (
            <WarningCircleIcon data-icon="inline-start" weight="fill" />
          ) : null}
          {details.label}
        </Badge>
      </div>

      {warning && !dismissed ? (
        <div
          role="alert"
          className="absolute top-14 right-3 flex w-[min(24rem,calc(100vw-1.5rem))] items-start gap-3 rounded-lg border border-warning/30 bg-popover p-3 text-sm shadow-lg"
        >
          <WarningCircleIcon weight="fill" className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{details.heading}</p>
            <p className="mt-0.5 text-body-muted-foreground">{details.description}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void rpc.request.windowClose({})}
              >
                Close window
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                Dismiss
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss warning" title="Dismiss" onClick={() => setDismissed(true)} className="shrink-0">
            <XIcon />
          </Button>
        </div>
      ) : null}
    </>
  );
}

function indicatorDetails(state: IndicatorState) {
  const expected = state.runtime?.development ? state.runtime.expected : undefined;
  const run = rendererDevGeneration.slice(0, 6);
  const started = expected
    ? new Date(expected.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : undefined;
  const revision = expected?.gitHead
    ? `${expected.gitHead}${expected.dirty ? " with local changes" : ""}`
    : "unknown revision";

  switch (state.freshness) {
    case "current":
      return {
        label: "DEV",
        title: `Current development run\nRun ${run} · started ${started}\nRevision ${revision}`,
        heading: "",
        description: "",
      };
    case "stale":
      return {
        label: "STALE",
        title: `Stale development window\nWindow run ${run}\nLatest run ${expected?.generation.slice(0, 6) ?? "unknown"}`,
        heading: "This development window is stale",
        description: "It belongs to an earlier run and may show old code or state. Close it before starting NativePi again.",
      };
    case "unverified": {
      const markerUnavailable = state.runtime?.development && !state.runtime.expected;
      return {
        label: "DEV ?",
        title: "NativePi cannot verify this development window.",
        heading: "Freshness cannot be verified",
        description: markerUnavailable
          ? "The current development run could not be identified. Close this window, then start NativePi again."
          : "The development host is not responding reliably. Close this window, then start NativePi again.",
      };
    }
    default:
      return {
        label: "DEV …",
        title: "Checking this development window…",
        heading: "",
        description: "",
      };
  }
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
