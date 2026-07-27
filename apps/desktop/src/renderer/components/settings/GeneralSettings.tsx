import { useEffect, useState } from "react";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { Button } from "@/components/ui/button.tsx";
import { isRemote, rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import type { LocalServerStatus } from "../../../shared/rpc-schema.ts";
import { ReadonlyRow, SettingsSection, SwitchRow } from "./rows.tsx";

export default function GeneralSettings() {
  const reopenLastProject = useAppStore((s) => s.reopenLastProject);
  const setReopenLastProject = useAppStore((s) => s.setReopenLastProject);
  const notifyOnTurnEnd = useAppStore((s) => s.preferences.notifyOnTurnEnd);
  const notificationSound = useAppStore((s) => s.preferences.notificationSound);
  const setPreference = useAppStore((s) => s.setPreference);

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection heading="Startup">
        <SwitchRow
          label="Reopen last project"
          description="Return to the project you were working in when NativePi starts."
          checked={reopenLastProject}
          onChange={setReopenLastProject}
        />
      </SettingsSection>

      <SettingsSection
        heading="Notifications"
        description="NativePi only notifies you when its window is in the background, so a run you are watching never interrupts itself."
      >
        <SwitchRow
          label="Notify when a turn finishes"
          description="Show a desktop notification with how long the run took and how many files changed."
          checked={notifyOnTurnEnd}
          onChange={(value) => setPreference("notifyOnTurnEnd", value)}
        />
        <SwitchRow
          label="Play a sound"
          description="Use your system's notification sound instead of a silent notification."
          checked={notificationSound}
          onChange={(value) => setPreference("notificationSound", value)}
          disabled={!notifyOnTurnEnd}
        />
      </SettingsSection>

      {!isRemote ? <LocalServerSettings /> : null}
    </div>
  );
}

function LocalServerSettings() {
  const [status, setStatus] = useState<LocalServerStatus>({ running: false, links: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void rpc.request.localServerStatus({}).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async () => {
    setBusy(true);
    setError(undefined);
    const next = await rpc.request.startLocalServer({});
    setStatus(next);
    setError(next.error);
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    await rpc.request.stopLocalServer({});
    setStatus({ running: false, links: [] });
    setBusy(false);
  };

  const copy = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SettingsSection
      heading="Local server"
      description="Open this NativePi workspace in a browser on another device connected to the same trusted network. Traffic is not encrypted, and the desktop app must stay open."
    >
      <div className="flex items-center justify-between gap-8 border-t py-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{status.running ? "Server running" : "Server stopped"}</p>
          <p className="text-sm leading-5 text-muted-foreground">
            {status.running
              ? "Anyone with the full link can control NativePi and access its projects. Stop the server when you are done."
              : "Starting creates a new private link for this session. If Windows asks, allow access on Private networks."}
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <Button
          variant={status.running ? "destructive" : "default"}
          onClick={() => void (status.running ? stop() : start())}
          disabled={busy}
        >
          {status.running ? <StopIcon weight="fill" data-icon="inline-start" /> : <PlayIcon weight="fill" data-icon="inline-start" />}
          {busy ? "Working…" : status.running ? "Stop server" : "Start server"}
        </Button>
      </div>
      {status.links.map((link, index) => (
        <ReadonlyRow
          key={link}
          label={index === 0 ? "Local link" : "Alternate network link"}
          description={index === 0 ? "Copy this entire link, including the access token after #token=." : undefined}
          value={link}
          action={
            <Button variant="outline" size="sm" onClick={() => void copy(link)}>
              <CopyIcon data-icon="inline-start" />
              {copied ? "Copied" : "Copy"}
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}
