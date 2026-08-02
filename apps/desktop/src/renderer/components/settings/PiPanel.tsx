import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import { useAppStore } from "../../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * The frame around every Pi-backed settings panel.
 *
 * All of them share the same three states — still loading, unreadable, and
 * "saved but waiting on a restart" — because all of them are views of one file
 * that Pi loads once at startup. Putting that here keeps each panel to the
 * settings it actually offers.
 */
export default function PiPanel({ children }: { children: (settings: PiSettings) => React.ReactNode }) {
  const settings = useAppStore((s) => s.piSettings);
  const error = useAppStore((s) => s.piSettingsError);

  if (!settings) {
    return error ? (
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <WarningCircleIcon weight="fill" className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">Pi's settings could not be read. {error}</span>
      </p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-body-muted-foreground">
        <CircleNotchIcon className="animate-spin" />
        Loading Pi's settings…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <PiSettingsStatus />
      {children(settings)}
    </div>
  );
}

function PiSettingsStatus() {
  const error = useAppStore((s) => s.piSettingsError);
  const restartPending = useAppStore((s) => s.piRestartPending);
  const applyRestart = useAppStore((s) => s.applyPiSettingsRestart);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const running = useAppStore((s) => Object.values(s.conversations).some((conversation) => conversation.running));

  if (error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
      >
        <WarningCircleIcon weight="fill" className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{error}</span>
      </p>
    );
  }

  if (!restartPending) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
      <InfoIcon className="shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-body-muted-foreground">
        Saved. Pi reads its settings when it starts, so this takes effect the next time it runs
        {activeProjectPath ? " in this project" : ""}.
      </p>
      {activeProjectPath ? (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={running}
          title={running ? "Wait for every running turn to finish" : undefined}
          onClick={() => void applyRestart()}
        >
          <ArrowClockwiseIcon data-icon="inline-start" />
          Restart Pi now
        </Button>
      ) : null}
    </div>
  );
}
