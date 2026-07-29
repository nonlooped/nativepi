import { useEffect, useReducer, useState } from "react";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { GlobeIcon } from "@phosphor-icons/react/Globe";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button.tsx";
import { isRemote, rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import type { LocalServerMode, LocalServerStatus } from "../../../shared/rpc-schema.ts";
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

      {!isRemote ? <RemoteAccessSettings /> : null}
    </div>
  );
}

const STOPPED: LocalServerStatus = { running: false, links: [] };

function RemoteAccessSettings() {
  const [status, setStatus] = useState<LocalServerStatus>(STOPPED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [preparing, setPreparing] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const expiresIn = useExpiresIn(status.expiresAt);

  useEffect(() => {
    let cancelled = false;
    void rpc.request.localServerStatus({}).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The host talks back while a public link is being prepared, and again on its
  // own when the link lapses hours later. A note means work in progress; its
  // absence means the status that came with it is the new truth.
  useEffect(
    () =>
      rpc.events.on("localServerChanged", ({ status: next, preparing: note }) => {
        setPreparing(note);
        if (!note) setStatus(next);
      }),
    [],
  );

  const start = async (mode: LocalServerMode) => {
    setBusy(true);
    setError(undefined);
    const next = await rpc.request.startLocalServer({ mode });
    setStatus(next);
    setError(next.error);
    setPreparing(undefined);
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    await rpc.request.stopLocalServer({});
    setStatus(STOPPED);
    setPreparing(undefined);
    setBusy(false);
  };

  const copy = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(link);
    setTimeout(() => setCopied(undefined), 1500);
  };

  const copyButton = (link: string) => (
    <Button variant="outline" size="sm" onClick={() => void copy(link)}>
      <CopyIcon data-icon="inline-start" />
      {copied === link ? "Copied" : "Copy"}
    </Button>
  );

  return (
    <SettingsSection
      heading="Remote access"
      description="Open this workspace in a browser on your phone or another computer. The desktop app has to stay running, and anyone holding the full link can use your projects and terminals."
    >
      <div className="flex items-center justify-between gap-8 border-t py-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">
            {status.publicLink ? "Public link running" : status.running ? "Sharing on this network" : "Not sharing"}
          </p>
          <p className="text-sm leading-5 text-muted-foreground">
            {preparing ??
              (status.running
                ? "Stop sharing when you are done. Each session gets a new link and a new token."
                : "A public link works from anywhere over HTTPS and needs nothing installed on the other device. Sharing on this network keeps traffic off the internet but only reaches devices on the same Wi-Fi.")}
          </p>
          {error ? (
            <p role="alert" className="text-sm whitespace-pre-wrap text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {status.running ? (
          <Button variant="destructive" onClick={() => void stop()} disabled={busy}>
            <StopIcon weight="fill" data-icon="inline-start" />
            {busy ? "Working…" : "Stop sharing"}
          </Button>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => void start("network")} disabled={busy}>
              <WifiHighIcon data-icon="inline-start" />
              This network
            </Button>
            <Button onClick={() => void start("public")} disabled={busy}>
              <GlobeIcon data-icon="inline-start" />
              {busy ? "Working…" : "Public link"}
            </Button>
          </div>
        )}
      </div>

      {status.publicLink ? (
        <>
          <ReadonlyRow
            label="Public link"
            description={`Copy the whole link, including the token after #token=. ${expiresIn}`}
            value={status.publicLink}
            action={copyButton(status.publicLink)}
          />
          <div className="flex items-center gap-4 border-t py-5">
            {/* The QR needs a light quiet zone to scan reliably against a dark
                app, and scanning is the point: the token is 32 characters that
                nobody should be retyping on a phone. */}
            <div className="shrink-0 rounded-md bg-white p-2">
              <QRCodeSVG value={status.publicLink} size={112} />
            </div>
            <p className="text-sm leading-5 text-muted-foreground">
              Point your phone's camera at this to open NativePi with the token already filled in.
            </p>
          </div>
        </>
      ) : null}

      {status.links.map((link, index) => (
        <ReadonlyRow
          key={link}
          label={index === 0 ? "Network link" : "Alternate network link"}
          description={
            index === 0
              ? "Reachable from this Wi-Fi only, over plain HTTP. If Windows asks, allow access on Private networks."
              : undefined
          }
          value={link}
          action={copyButton(link)}
        />
      ))}
    </SettingsSection>
  );
}

/** A sentence about when a public link lapses, refreshed while settings are open. */
function useExpiresIn(expiresAt?: number): string {
  const [, tick] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return "";
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  if (minutes < 60) return `It stops working in ${minutes} minutes.`;
  const hours = Math.round(minutes / 60);
  return `It stops working in about ${hours} ${hours === 1 ? "hour" : "hours"}.`;
}
