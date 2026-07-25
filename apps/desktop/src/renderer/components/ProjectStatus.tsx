import { useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { ShieldWarningIcon } from "@phosphor-icons/react/ShieldWarning";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { PiStatus } from "../../shared/rpc-schema.ts";
import { useAppStore } from "../lib/store.ts";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import { cn } from "@/lib/utils.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

export default function ProjectStatus({ className }: { className?: string }) {
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
            {health.spinning ? (
              <CircleNotchIcon className="animate-spin" />
            ) : (
              <WarningCircleIcon weight="fill" />
            )}
            <span>{health.label}</span>
          </MenuTrigger>
          <MenuPopup align="end" className="w-72 p-1.5">
            <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">{health.detail}</p>
            <MenuItem onClick={() => void restartPi()} className="rounded-md text-sm">
              Restart Pi
            </MenuItem>
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
            <span>{trust.trusted ? "Trusted" : "Restricted"}</span>
          </MenuTrigger>
          <MenuPopup align="end" className="w-80 p-1.5">
            <p className="px-2 pb-2 pt-1 text-xs leading-relaxed text-muted-foreground">
              {trust.trusted
                ? "This project's local extensions and skills run inside Pi."
                : "This project's local extensions and skills are not loaded. Pi is running without them."}
            </p>
            {trust.trusted ? (
              <MenuItem onClick={() => setConfirmingRevoke(true)} className="rounded-md text-sm text-destructive">
                Revoke trust and restart Pi…
              </MenuItem>
            ) : (
              <MenuItem onClick={promptTrust} className="rounded-md text-sm">
                Review and trust this project…
              </MenuItem>
            )}
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

function healthOf(
  status: PiStatus | undefined,
): { label: string; detail: string; tone: string; spinning: boolean } | null {
  switch (status) {
    case "starting":
      return {
        label: "Starting",
        detail: "Pi is starting up for this project.",
        tone: "text-muted-foreground",
        spinning: true,
      };
    case "error":
      return {
        label: "Pi error",
        detail: "Pi could not start for this project. Restarting may fix it.",
        tone: "text-destructive",
        spinning: false,
      };
    case "exited":
      return {
        label: "Pi stopped",
        detail: "Pi exited for this project. Restart it to keep working.",
        tone: "text-warning",
        spinning: false,
      };
    default:
      return null;
  }
}
