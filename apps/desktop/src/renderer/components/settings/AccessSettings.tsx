import { useEffect, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button.tsx";
import type { AccessStatus, RemoteAccessStatus } from "../../../shared/rpc-schema.ts";
import { rpc } from "../../lib/rpc.ts";
import { ReadonlyRow, SettingsSection } from "./rows.tsx";

const STOPPED_STATUS: AccessStatus = {
  local: { running: false, links: [], clients: [] },
  remote: { state: "idle" },
};

type Action =
  | "local"
  | "remote"
  | "replace";

export default function AccessSettings() {
  const [status, setStatus] = useState<AccessStatus>(STOPPED_STATUS);
  const [busy, setBusy] = useState<Action>();
  const [copied, setCopied] = useState<"local" | "remote">();
  const [preferredLocalLink, setPreferredLocalLink] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const next = await rpc.request.accessStatus({});
        if (!cancelled) setStatus(next);
      } catch (error) {
        if (!cancelled) {
          setStatus((current) => ({
            ...current,
            local: { ...current.local, error: errorMessage(error) },
          }));
        }
      }
    };
    void read();
    const interval = setInterval(read, 4_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const run = async (action: Action, request: Promise<AccessStatus>) => {
    setBusy(action);
    try {
      setStatus(await request);
    } catch (error) {
      setStatus((current) => action === "remote"
        ? { ...current, remote: { state: "error", error: errorMessage(error) } }
        : { ...current, local: { ...current.local, error: errorMessage(error) } });
    } finally {
      setBusy(undefined);
    }
  };

  const copy = async (target: "local" | "remote", link: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(target);
    setTimeout(() => setCopied((current) => current === target ? undefined : current), 1_500);
  };

  const localLink = status.local.links.includes(preferredLocalLink ?? "")
    ? preferredLocalLink
    : status.local.link;

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        heading="Local access"
        description="Use NativePi from another device on the same trusted network. The desktop app must stay open."
      >
        <AccessControl
          title={status.local.running ? "Available on your network" : "Not shared"}
          description={status.local.running
            ? "The link is temporary and stops working when you stop access or close NativePi."
            : "Start local access, then open the link on your other device."}
          error={status.local.error}
          action={
            <Button
              variant={status.local.running ? "destructive" : "default"}
              disabled={Boolean(busy)}
              onClick={() => void run(
                "local",
                status.local.running
                  ? rpc.request.stopLocalAccess({})
                  : rpc.request.startLocalAccess({}),
              )}
            >
              {status.local.running
                ? <StopIcon weight="fill" data-icon="inline-start" />
                : <PlayIcon weight="fill" data-icon="inline-start" />}
              {busy === "local"
                ? "Working…"
                : status.local.running ? "Stop local access" : "Start local access"}
            </Button>
          }
        />
        {localLink ? (
          <ReadonlyRow
            label="Temporary link"
            description="Anyone with the complete link can control NativePi. Share it only with devices you trust."
            value={localLink}
            action={
              <div className="flex shrink-0 items-center gap-1">
                {status.local.links.length > 1 ? (
                  <select
                    aria-label="Network address"
                    className="h-8 max-w-40 rounded-md border bg-background px-2 text-xs"
                    value={localLink}
                    onChange={(event) => setPreferredLocalLink(event.target.value)}
                  >
                    {status.local.links.map((link) => (
                      <option key={link} value={link}>{new URL(link).hostname}</option>
                    ))}
                  </select>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => void run("replace", rpc.request.replaceAccessLink({}))}
                >
                  <ArrowsClockwiseIcon data-icon="inline-start" />
                  {busy === "replace" ? "Replacing…" : "Replace"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void copy("local", localLink)}>
                  <CopyIcon data-icon="inline-start" />
                  {copied === "local" ? "Copied" : "Copy"}
                </Button>
              </div>
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        heading="Remote access"
        description="Use NativePi away from home over a temporary public HTTPS link. Nothing needs to be installed on the device you connect from, and the access token in the link is what keeps it yours."
      >
        <AccessControl
          title={remoteTitle(status.remote)}
          description={status.remote.preparing ?? remoteDescription(status.remote)}
          error={status.remote.error}
          action={<RemoteAction status={status.remote} busy={Boolean(busy)} onRun={run} />}
        />
        {status.remote.link ? (
          <>
            <ReadonlyRow
              label="Public link"
              description={`Anyone with the complete link can control NativePi. ${expiresIn(status.remote.expiresAt)}`}
              value={status.remote.link}
              action={
                <Button variant="outline" size="sm" onClick={() => void copy("remote", status.remote.link!)}>
                  <CopyIcon data-icon="inline-start" />
                  {copied === "remote" ? "Copied" : "Copy"}
                </Button>
              }
            />
            <div className="flex items-center gap-4 border-t py-5">
              {/* The QR needs a light quiet zone to scan against a dark app, and
                  scanning is the point: the token is 32 characters nobody should
                  be retyping on a phone. */}
              <div className="shrink-0 rounded-md bg-white p-2">
                <QRCodeSVG value={status.remote.link} size={112} />
              </div>
              <p className="text-sm leading-5 text-muted-foreground">
                Point your phone's camera at this to open NativePi with the token already filled in.
              </p>
            </div>
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection
        heading="Connected devices"
        description="Browsers currently authenticated with this access link."
      >
        {status.local.clients.length === 0 ? (
          <div className="border-t py-5">
            <p className="text-sm text-muted-foreground">
              {status.local.running ? "No other devices are connected." : "Start access to connect another device."}
            </p>
          </div>
        ) : status.local.clients.map((client) => (
          <div
            key={client.id}
            className="flex flex-col gap-1 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{client.device}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span>{client.location === "remote" ? "Remote" : client.address}</span>
              <span aria-hidden="true">·</span>
              <span>Connected {formatTime(client.connectedAt)}</span>
            </div>
          </div>
        ))}
      </SettingsSection>
    </div>
  );
}

function AccessControl({
  title,
  description,
  error,
  action,
}: {
  title: string;
  description: string;
  error?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm leading-5 text-muted-foreground">{description}</p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RemoteAction({
  status,
  busy,
  onRun,
}: {
  status: RemoteAccessStatus;
  busy: boolean;
  onRun: (action: Action, request: Promise<AccessStatus>) => Promise<void>;
}) {
  if (status.state === "running") {
    return (
      <Button
        variant="destructive"
        disabled={busy}
        onClick={() => void onRun("remote", rpc.request.stopRemoteAccess({}))}
      >
        <StopIcon weight="fill" data-icon="inline-start" />
        {busy ? "Working…" : "Stop remote access"}
      </Button>
    );
  }
  if (status.state === "error") {
    return (
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void onRun("remote", rpc.request.startRemoteAccess({}))}
      >
        <ArrowsClockwiseIcon data-icon="inline-start" />
        {busy ? "Working…" : "Try again"}
      </Button>
    );
  }
  return (
    <Button
      disabled={busy || status.state === "starting"}
      onClick={() => void onRun("remote", rpc.request.startRemoteAccess({}))}
    >
      <PlayIcon weight="fill" data-icon="inline-start" />
      {busy || status.state === "starting" ? "Starting…" : "Start remote access"}
    </Button>
  );
}

function remoteTitle(status: RemoteAccessStatus): string {
  switch (status.state) {
    case "idle": return "Not shared";
    case "starting": return "Creating a public link";
    case "running": return "Available anywhere";
    case "error": return "Remote access needs attention";
  }
}

function remoteDescription(status: RemoteAccessStatus): string {
  switch (status.state) {
    case "idle":
      return "Creates a temporary Cloudflare address that reaches this computer. The first run downloads the tunnel client, which takes a moment.";
    case "starting":
      return "Asking Cloudflare for an address.";
    case "running":
      return "The link works from any network. Stop remote access when you are done.";
    case "error":
      return "The tunnel did not start. Check this computer's internet connection, then try again.";
  }
}

/** A sentence about when the public link closes itself. */
function expiresIn(expiresAt?: number): string {
  if (!expiresAt) return "";
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  if (minutes < 60) return `It stops working in ${minutes} minutes.`;
  const hours = Math.round(minutes / 60);
  return `It stops working in about ${hours} ${hours === 1 ? "hour" : "hours"}.`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
