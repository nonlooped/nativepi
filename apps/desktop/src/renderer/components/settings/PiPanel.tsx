import StateNotice from "../StateNotice.tsx";
import { createContext, useContext, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import { useAppStore } from "../../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";

export const SettingsStatusContext = createContext(false);

/**
 * The frame around every Pi-backed settings panel.
 *
 * All of them share the same three states — still loading, unreadable, and
 * "saved but waiting on a restart" — because all of them are views of one file
 * that Pi loads once at startup. Putting that here keeps each panel to the
 * settings it actually offers.
 */
export default function PiPanel({ children }: { children: (settings: PiSettings) => React.ReactNode }) {
  const globalStatus = useContext(SettingsStatusContext);
  const settings = useAppStore((s) => s.piSettings);
  const error = useAppStore((s) => s.piSettingsError);

  if (!settings) {
    return error ? (
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <WarningCircleIcon weight="fill" className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">Pi's settings could not be read. {error}</span>
      </p>
    ) : (
      <StateNotice loading title="Loading Pi's settings…" />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!globalStatus ? <PiSettingsStatus /> : null}
      {children(settings)}
    </div>
  );
}

export function PiSettingsStatus() {
  const error = useAppStore((s) => s.piSettingsError);
  const restartPending = useAppStore((s) => s.piRestartPending);
  const applyRestart = useAppStore((s) => s.applyPiSettingsRestart);
  const [pending, setPending] = useState(false);
  const running = useAppStore((s) => Object.values(s.conversations).some((conversation) => conversation.running));

  // An empty wrapper would still claim a gap in the panel's flex column.
  if (!error && !restartPending) return null;

  return (
    <div className="flex flex-col gap-2">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {restartPending ? <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-md bg-muted/20 px-3 py-2.5 text-xs">
      <InfoIcon className="shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-body-muted-foreground">
        Saved. Open chats use these changes after Pi restarts.
      </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={running || pending}
          title={running ? "Wait for every running turn to finish" : undefined}
          onClick={async () => { setPending(true); try { await applyRestart(); } finally { setPending(false); } }}
        >
          <ArrowClockwiseIcon data-icon="inline-start" />
          {pending ? "Restarting…" : "Restart Pi"}
        </Button>
      {running ? <p className="w-full text-body-muted-foreground">Wait for all running turns to finish before restarting open chats.</p> : null}
      </div> : null}
    </div>
  );
}
