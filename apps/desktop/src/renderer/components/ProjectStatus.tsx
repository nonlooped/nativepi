import { useEffect, useRef, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { ShieldWarningIcon } from "@phosphor-icons/react/ShieldWarning";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { PiStatus } from "../../shared/rpc-schema.ts";
import { useAppStore } from "../lib/store.ts";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { SCROLLBAR_GUTTER_OFFSET, cn } from "@/lib/utils.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

export default function ProjectStatus({ compact = false, className }: { compact?: boolean; className?: string }) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const piStatus = useAppStore((s) => (s.activeProjectPath ? s.piStatus[s.activeProjectPath] : undefined));
  const trust = useAppStore((s) => s.trust);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const restartPi = useAppStore((s) => s.reloadExtensions);
  const revokeTrust = useAppStore((s) => s.revokeTrust);
  const promptTrust = useAppStore((s) => s.promptTrust);

  const health = healthOf(piStatus);

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {health ? (
        <Menu>
          <MenuTrigger
            title={health.detail}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              health.tone,
            )}
          >
            <WarningCircleIcon weight="fill" />
            <span className={cn(compact && "max-[480px]:hidden")}>{health.label}</span>
          </MenuTrigger>
          <MenuPopup align="end" className="w-72 p-1.5">
            <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">{health.detail}</p>
             <MenuGroup><MenuItem onClick={() => void restartPi()} className="rounded-md text-sm">
              Restart Pi
             </MenuItem></MenuGroup>
          </MenuPopup>
        </Menu>
      ) : null}

      {/* Announced separately so a failed start is not silent for screen readers. */}
      <span role="status" aria-live="polite" className="sr-only">
        {health ? health.detail : ""}
      </span>

      {trust?.required ? (
        <Menu>
          <MenuTrigger
            title={
              trust.trusted
                ? "Local extensions and skills are loaded for this project"
                : "Local extensions and skills are disabled for this project"
            }
            aria-label={trust.trusted ? "Project trusted" : "Project not trusted"}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              trust.trusted ? "text-muted-foreground" : "text-warning",
            )}
          >
            {trust.trusted ? <ShieldCheckIcon weight="fill" /> : <ShieldWarningIcon weight="fill" />}
            <span className={cn(compact && "max-[480px]:hidden")}>{trust.trusted ? "Trusted" : "Restricted"}</span>
          </MenuTrigger>
          <MenuPopup align="end" className="w-80 p-1.5">
            <p className="px-2 pb-2 pt-1 text-xs leading-relaxed text-body-muted-foreground">
              {trust.trusted
                ? "This project's local extensions and skills run inside Pi."
                : "This project's local extensions and skills are not loaded. Pi is running without them."}
            </p>
             <MenuGroup>{trust.trusted ? (
              <MenuItem onClick={() => setConfirmingRevoke(true)} className="rounded-md text-sm text-destructive">
                Revoke trust and restart Pi…
              </MenuItem>
            ) : (
              <MenuItem onClick={promptTrust} className="rounded-md text-sm">
                Review and trust this project…
              </MenuItem>
             )}</MenuGroup>
          </MenuPopup>
        </Menu>
      ) : null}

      {/* Revoking restarts Pi under the user, which is not something to do on a
          single click of a menu row. */}
      <ConfirmDialog
        open={confirmingRevoke}
        title="Revoke trust for this project?"
        description={
          <>
            Pi will restart and stop loading this project's local extensions and skills. Anything running right now is
            stopped. You can trust the project again from this same menu.
          </>
        }
        detail={activeProjectPath ?? undefined}
        confirmLabel="Revoke and restart"
        destructive
        onConfirm={() => {
          setConfirmingRevoke(false);
          void revokeTrust();
        }}
        onCancel={() => setConfirmingRevoke(false)}
      />
    </div>
  );
}

/*
  Starting Pi is routine, expected and over in about a second, so this is
  deliberately not built like `ErrorBanner` beside it: no tinted fill, no
  headline, no border. Those say "act now", and there is nothing to act on
  here.

  It also floats instead of taking a row in the column. In the flow it pushed
  the whole conversation down on mount and let it snap back a second later,
  which is a lot of movement to report that nothing is wrong.
*/
export function PiStartingNotice() {
  const piStarting = useAppStore((s) =>
    s.activeProjectPath ? s.piStatus[s.activeProjectPath] === "starting" : false,
  );
  const phase = useSlowStartPhase(piStarting);

  if (!phase) return null;

  return (
    // `top-12` clears `WorkspaceHeader`'s `h-12`. The gutter offset centres it
    // over the same optical axis as the transcript and composer below.
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-12 z-20 flex justify-center px-4",
        SCROLLBAR_GUTTER_OFFSET,
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-popover py-1.5 pr-3 pl-2.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150",
          phase === "entering"
            ? "animate-in fade-in-0 slide-in-from-top-1"
            : "animate-out fade-out-0 slide-out-to-top-1",
        )}
      >
        <CircleNotchIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span className="font-medium">Starting Pi</span>
        <span aria-hidden="true" className="text-muted-foreground/40">
          ·
        </span>
        {/* The one thing the header's status chip cannot say, and the only
            reason this is on screen at all: a draft written now is not lost. */}
        <span className="text-muted-foreground">you can keep typing</span>
      </div>
    </div>
  );
}

/** How long a start has to run before it is worth mentioning. */
const APPEAR_AFTER = 400;
/** Once mentioned, the floor on how long it stays. */
const MIN_VISIBLE = 900;
const FADE_OUT = 150;

/**
 * Paces a transient indicator so it never blinks.
 *
 * A warm start settles well inside `APPEAR_AFTER`, and an indicator that paints
 * and unpaints inside that window reads as a glitch rather than as progress —
 * so a fast start is silent, and a slow one is held for `MIN_VISIBLE` and then
 * faded out rather than cut.
 */
function useSlowStartPhase(active: boolean): "entering" | "leaving" | null {
  const [phase, setPhase] = useState<"entering" | "leaving" | null>(null);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    let appearTimer: ReturnType<typeof setTimeout> | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    if (active) {
      // Already on screen, or fading out and now needed again: either way this
      // is one continuous start, so keep the original entry.
      if (shownAt.current !== null) setPhase("entering");
      else {
        appearTimer = setTimeout(() => {
          shownAt.current = Date.now();
          setPhase("entering");
        }, APPEAR_AFTER);
      }
    } else if (shownAt.current === null) {
      setPhase(null);
    } else {
      const held = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt.current));
      holdTimer = setTimeout(() => {
        setPhase("leaving");
        fadeTimer = setTimeout(() => {
          shownAt.current = null;
          setPhase(null);
        }, FADE_OUT);
      }, held);
    }

    return () => {
      clearTimeout(appearTimer);
      clearTimeout(holdTimer);
      clearTimeout(fadeTimer);
    };
  }, [active]);

  return phase;
}

/*
  Only the states that need the user. A start in progress needs nothing from
  them and resolves on its own, and the one action this chip offers — restart —
  is meaningless against a Pi that is already starting. `PiStartingNotice`
  carries that state instead, which keeps one spinner on screen rather than two
  reporting the same second.
*/
function healthOf(status: PiStatus | undefined): { label: string; detail: string; tone: string } | null {
  switch (status) {
    case "error":
      return {
        label: "Pi error",
        detail: "Pi could not start for this project. Restarting may fix it.",
        tone: "text-destructive",
      };
    case "exited":
      return {
        label: "Pi stopped",
        detail: "Pi exited for this project. Restart it to keep working.",
        tone: "text-warning",
      };
    default:
      return null;
  }
}
