import { useEffect, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { QrCodeIcon } from "@phosphor-icons/react/QrCode";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import type { AccessClient, AccessStatus, RemoteAccessStatus } from "../../../shared/rpc-schema.ts";
import type { AccessHandoff } from "../../lib/store/types.ts";
import { rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import ConfirmDialog from "../ConfirmDialog.tsx";
import { ReadonlyRow, SettingsSection } from "./rows.tsx";

const STOPPED_STATUS: AccessStatus = {
  local: { running: false, links: [], clients: [] },
  remote: { state: "idle" },
};

type Scope = "local" | "remote";
type Action = Scope | "replace" | "revoke";

export default function AccessSettings() {
  const [status, setStatus] = useState<AccessStatus>(STOPPED_STATUS);
  const [busy, setBusy] = useState<Action>();
  const [copied, setCopied] = useState<Scope>();
  const [preferredLocalLink, setPreferredLocalLink] = useState<string>();
  const [showing, setShowing] = useState<{ scope: Scope; link: string }>();
  const [pending, setPending] = useState<"replace" | "revoke">();
  const handoffs = useAppStore((s) => s.accessHandoffs);
  const recordHandoff = useAppStore((s) => s.recordAccessHandoff);

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

  const copy = async (scope: Scope, link: string) => {
    await navigator.clipboard.writeText(link);
    recordHandoff("copy", scope, link);
    setCopied(scope);
    setTimeout(() => setCopied((current) => current === scope ? undefined : current), 1_500);
  };

  const showQr = (scope: Scope, link: string) => {
    recordHandoff("qr", scope, link);
    setShowing({ scope, link });
  };

  const localLink = status.local.links.includes(preferredLocalLink ?? "")
    ? preferredLocalLink
    : status.local.link;
  const clients = status.local.clients;
  const shared = status.local.running || status.remote.state !== "idle";

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
                <LinkActions scope="local" link={localLink} copied={copied === "local"} onCopy={copy} onShowQr={showQr} />
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
          <ReadonlyRow
            label="Public link"
            description={`Anyone with the complete link can control NativePi. ${expiresIn(status.remote.expiresAt)}`}
            value={status.remote.link}
            action={
              <LinkActions
                scope="remote"
                link={status.remote.link}
                copied={copied === "remote"}
                onCopy={copy}
                onShowQr={showQr}
              />
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        heading={clients.length === 0 ? "Connected devices" : `Connected devices · ${clients.length}`}
        description={connectedSummary(clients, shared)}
      >
        {clients.length === 0 ? (
          <div className="border-t py-5">
            <p className="text-sm text-muted-foreground">
              {shared ? "No other devices are connected." : "Start access to connect another device."}
            </p>
          </div>
        ) : clients.map((client) => (
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

      <SettingsSection
        heading="Link handoffs"
        description="Every time this window handed a link to another device, since it opened. Nothing records who received one, so this is the only account there is of where a link has gone."
      >
        {handoffs.length === 0 ? (
          <div className="border-t py-5">
            <p className="text-sm text-muted-foreground">No link has been copied or shown yet.</p>
          </div>
        ) : handoffs.map((handoff) => (
          <div
            key={handoff.id}
            className="flex flex-col gap-1 border-t py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{describeHandoff(handoff)}</p>
              <p className="truncate font-mono text-xs text-muted-foreground" title={handoff.link}>
                {handoff.link}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{formatClock(handoff.at)}</span>
          </div>
        ))}
      </SettingsSection>

      {/* Only while something is shared: a token nothing is serving is not a
          thing anyone needs to revoke, and two destructive buttons standing
          permanently at the foot of the screen invite exactly one accident. */}
      {shared ? (
        <SettingsSection
          heading="Access token"
          description="Local and remote links carry the same token, and neither the app nor Cloudflare knows who holds a copy."
        >
          <AccessControl
            title="Replace the token"
            description="Both links are minted again and every connected device is signed out. Access itself stays on."
            action={
              <Button variant="outline" disabled={Boolean(busy) || status.remote.state === "starting"} onClick={() => setPending("replace")}>
                <ArrowsClockwiseIcon data-icon="inline-start" />
                {busy === "replace" ? "Replacing…" : "Replace token"}
              </Button>
            }
          />
          <AccessControl
            title="Revoke all access"
            description="Closes the public link and the network server together. NativePi goes back to this window only."
            action={
              <Button variant="destructive" disabled={Boolean(busy) || status.remote.state === "starting"} onClick={() => setPending("revoke")}>
                <StopIcon weight="fill" data-icon="inline-start" />
                {busy === "revoke" ? "Revoking…" : "Revoke access"}
              </Button>
            }
          />
        </SettingsSection>
      ) : null}

      <ConfirmDialog
        open={pending !== undefined}
        title={pending === "revoke" ? "Revoke all access?" : "Replace the access token?"}
        description={
          pending === "revoke"
            ? "Local and remote access both stop and every link handed out so far goes dead. Nothing on this computer changes."
            : "Every link handed out so far stops working, and any device still using one has to be given the new link."
        }
        detail={clients.length > 0 ? `${clients.length} device${clients.length === 1 ? "" : "s"} connected right now` : undefined}
        confirmLabel={pending === "revoke" ? "Revoke access" : "Replace token"}
        destructive
        onConfirm={() => {
          const action = pending;
          setPending(undefined);
          if (action === "revoke") void run("revoke", rpc.request.revokeAccess({}));
          else if (action === "replace") void run("replace", rpc.request.replaceAccessLink({}));
        }}
        onCancel={() => setPending(undefined)}
      />

      <Dialog open={showing !== undefined} onOpenChange={(next) => !next && setShowing(undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-base font-semibold">
              {showing?.scope === "remote" ? "Public link" : "Network link"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Point the other device's camera at this. The token is in the code, so there is nothing to type.
            </DialogDescription>
          </DialogHeader>
          {/* The code needs a light quiet zone to scan against a dark app. */}
          <div className="mx-auto rounded-md bg-white p-3">
            {showing ? <QRCodeSVG value={showing.link} size={192} /> : null}
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">{showing?.link}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Copy and QR, the two ways a link leaves this window.
 *
 * Side by side because they are the same act — handing an address and its token
 * to another device — and both are what the handoff list is a record of. The
 * code sits behind a button rather than permanently on screen so that the local
 * link gets one too: a LAN address plus a 32 character token is precisely the
 * thing nobody should be retyping on a phone.
 */
function LinkActions({
  scope,
  link,
  copied,
  onCopy,
  onShowQr,
}: {
  scope: Scope;
  link: string;
  copied: boolean;
  onCopy: (scope: Scope, link: string) => Promise<void>;
  onShowQr: (scope: Scope, link: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => onShowQr(scope, link)}>
        <QrCodeIcon data-icon="inline-start" />
        QR code
      </Button>
      <Button variant="outline" size="sm" onClick={() => void onCopy(scope, link)}>
        <CopyIcon data-icon="inline-start" />
        {copied ? "Copied" : "Copy"}
      </Button>
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
    // A tunnel that stopped routing while its client kept running is still
    // "running" to everything else here, and reads as fine until someone tries
    // the link on a phone.
    case "running": return status.reachable === false ? "The link is not answering" : "Available anywhere";
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
      return health(status);
    case "error":
      return "The tunnel did not start. Check this computer's internet connection, then try again.";
  }
}

/**
 * What the last check of a live link found.
 *
 * The age of the reading is part of the answer: a check from a minute ago is
 * worth more than the same word with no time attached to it.
 */
function health(status: RemoteAccessStatus): string {
  if (status.reachable === undefined) return "The link works from any network. Stop remote access when you are done.";
  const when = status.checkedAt ? `, checked ${ago(status.checkedAt)}` : "";
  return status.reachable
    ? `The address answered${when}. Stop remote access when you are done.`
    : `The address did not answer${when}. Cloudflare may still be re-routing it; replace the token if it does not clear.`;
}

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 90) return "just now";
  return `${Math.round(seconds / 60)} minutes ago`;
}

/** How many devices are connected, and over which of the two links. */
function connectedSummary(clients: AccessClient[], shared: boolean): string {
  if (clients.length === 0) {
    return shared
      ? "Browsers currently authenticated with an access link."
      : "Nothing can connect while both kinds of access are stopped.";
  }
  const remote = clients.filter((client) => client.location === "remote").length;
  const local = clients.length - remote;
  const parts = [
    local > 0 ? `${local} on your network` : "",
    remote > 0 ? `${remote} over the public link` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}. Every one of them can control NativePi.`;
}

function describeHandoff(handoff: AccessHandoff): string {
  const where = handoff.scope === "remote" ? "public link" : "network link";
  return handoff.kind === "copy" ? `Copied the ${where}` : `Showed a QR code for the ${where}`;
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
  return formatClock(new Date(value).getTime());
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
