import { useEffect, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { Button } from "@/components/ui/button.tsx";
import type { AccessStatus, RemoteAccessStatus } from "../../../shared/rpc-schema.ts";
import { rpc } from "../../lib/rpc.ts";
import { ReadonlyRow, SettingsSection } from "./rows.tsx";

const STOPPED_STATUS: AccessStatus = {
  local: { running: false, links: [], clients: [] },
  remote: { state: "checking" },
};

type Action =
  | "local"
  | "remote"
  | "replace"
  | "refresh";

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
      setStatus((current) => action === "remote" || action === "refresh"
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
        description="Use NativePi away from home through your private Tailscale network. NativePi never receives your Tailscale credentials."
      >
        <AccessControl
          title={remoteTitle(status.remote)}
          description={remoteDescription(status.remote)}
          error={status.remote.error}
          action={<RemoteAction status={status.remote} busy={Boolean(busy)} onRun={run} />}
        />
        {status.remote.link ? (
          <ReadonlyRow
            label="Remote link"
            description="Open this HTTPS link on a device signed in to the same Tailscale network."
            value={status.remote.link}
            action={
              <Button variant="outline" size="sm" onClick={() => void copy("remote", status.remote.link!)}>
                <CopyIcon data-icon="inline-start" />
                {copied === "remote" ? "Copied" : "Copy"}
              </Button>
            }
          />
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
              {client.user ? <p className="truncate text-sm text-muted-foreground">{client.user}</p> : null}
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
  if (status.state === "not-installed") {
    return (
      <Button
        variant="outline"
        onClick={() => void rpc.request.openExternal({ url: "https://tailscale.com/download/windows" })}
      >
        <DownloadSimpleIcon data-icon="inline-start" />
        Get Tailscale
      </Button>
    );
  }
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
  if (status.setupUrl) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="outline" onClick={() => void rpc.request.openExternal({ url: status.setupUrl! })}>
          Finish setup
          <ArrowSquareOutIcon data-icon="inline-end" />
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void onRun("refresh", rpc.request.refreshRemoteAccess({}))}
        >
          Check again
        </Button>
      </div>
    );
  }
  if (status.state === "available") {
    return (
      <Button
        disabled={busy}
        onClick={() => void onRun("remote", rpc.request.startRemoteAccess({}))}
      >
        <PlayIcon weight="fill" data-icon="inline-start" />
        {busy ? "Starting…" : "Start remote access"}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      disabled={busy || status.state === "checking" || status.state === "starting"}
      onClick={() => void onRun("refresh", rpc.request.refreshRemoteAccess({}))}
    >
      <ArrowsClockwiseIcon data-icon="inline-start" />
      {status.state === "checking" || status.state === "starting" ? "Checking…" : "Check again"}
    </Button>
  );
}

function remoteTitle(status: RemoteAccessStatus): string {
  switch (status.state) {
    case "not-installed": return "Tailscale is required";
    case "signed-out": return "Sign in to Tailscale";
    case "available": return "Ready to connect";
    case "starting": return "Starting remote access";
    case "running": return "Available remotely";
    case "error": return status.setupUrl ? "Finish Tailscale setup" : "Remote access needs attention";
    case "checking": return "Checking Tailscale";
  }
}

function remoteDescription(status: RemoteAccessStatus): string {
  switch (status.state) {
    case "not-installed": return "Install Tailscale on this computer and the device you want to connect from.";
    case "signed-out": return "Open Tailscale, sign in, then check again.";
    case "available": return "Only devices in your Tailscale network will be able to connect.";
    case "starting": return "Creating a private HTTPS link.";
    case "running": return "Only devices in your Tailscale network can open the remote link.";
    case "error": return status.setupUrl
      ? "Approve HTTPS access in Tailscale, then start Remote Access again."
      : "Check that Tailscale is running, then try again.";
    case "checking": return "Looking for the Tailscale app on this computer.";
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
