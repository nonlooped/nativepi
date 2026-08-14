import { useEffect, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DevicesIcon } from "@phosphor-icons/react/Devices";
import { GlobeIcon } from "@phosphor-icons/react/Globe";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { QrCodeIcon } from "@phosphor-icons/react/QrCode";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button.tsx";
import { ContextualIcon } from "@/components/ui/contextual-icon.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import type { AccessClient, AccessStatus, RemoteAccessStatus } from "../../../shared/rpc-schema.ts";
import type { AccessHandoff } from "../../lib/store/types.ts";
import { isRemote, rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import ConfirmDialog from "../ConfirmDialog.tsx";
import { SettingsCard, type CardTone } from "./rows.tsx";

const STOPPED_STATUS: AccessStatus = {
  local: { running: false, links: [], clients: [] },
  remote: { state: "idle" },
};

type Scope = "local" | "remote";
type Action = Scope | "replace" | "revoke";

/**
 * Two ways to reach this window from somewhere else.
 *
 * Each one is a single card carrying its own state, its own button and, once it
 * is on, its own link — because that is the whole task. Everything that is a
 * record rather than a step, the handoff log and the token controls, sits behind
 * one disclosure at the foot so that setting access up is two clicks and reading
 * about it is a decision.
 */
export default function AccessSettings() {
  const [status, setStatus] = useState<AccessStatus>(STOPPED_STATUS);
  const [busy, setBusy] = useState<Action>();
  const [copied, setCopied] = useState<Scope>();
  const [preferredLocalLink, setPreferredLocalLink] = useState<string>();
  const [showing, setShowing] = useState<{ scope: Scope; link: string }>();
  const [pending, setPending] = useState<"replace" | "revoke">();
  const [auditOpen, setAuditOpen] = useState(false);
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
  const remote = status.remote;

  if (isRemote) {
    return (
      <SettingsCard
        icon={<DevicesIcon />}
        title="Managed on the desktop"
        status="View only from this device"
        description="Return to the NativePi desktop window to start, stop, or replace access links. A browser cannot change the link it is currently using."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        icon={<WifiHighIcon />}
        title="Local access"
        tone={status.local.running ? "active" : "idle"}
        status={status.local.running ? "Serving on your network" : "Not shared"}
        description="Reach this window from another device on the same network. NativePi has to stay open."
        error={status.local.error}
        action={
          <Button
            variant={status.local.running ? "destructive" : "default"}
            size="xl"
            disabled={Boolean(busy)}
            onClick={() => void run(
              "local",
              status.local.running ? rpc.request.stopLocalAccess({}) : rpc.request.startLocalAccess({}),
            )}
          >
            <ContextualIcon
              data-icon="inline-start"
              active={status.local.running}
              activeIcon={<StopIcon weight="fill" />}
              inactiveIcon={<PlayIcon weight="fill" />}
            />
            {busy === "local" ? "Working…" : status.local.running ? "Stop" : "Start"}
          </Button>
        }
      >
        {localLink ? (
          <LinkPanel
            scope="local"
            link={localLink}
            note="The link stops working when you stop access or close NativePi."
            copied={copied === "local"}
            onCopy={copy}
            onShowQr={showQr}
            addresses={status.local.links}
            onPickAddress={setPreferredLocalLink}
          />
        ) : null}
      </SettingsCard>

      <SettingsCard
        icon={<GlobeIcon />}
        title="Remote access"
        tone={remoteTone(remote)}
        status={remoteStatus(remote)}
        description={remote.preparing ?? remoteDescription(remote)}
        error={remote.error}
        action={<RemoteAction status={remote} busy={Boolean(busy)} onRun={run} />}
      >
        {remote.link ? (
          <LinkPanel
            scope="remote"
            link={remote.link}
            note={expiresIn(remote.expiresAt) || "Nothing needs to be installed on the device you open it from."}
            copied={copied === "remote"}
            onCopy={copy}
            onShowQr={showQr}
          />
        ) : null}
      </SettingsCard>

      {shared ? (
        <SettingsCard
          icon={<DevicesIcon />}
          title="Connected devices"
          tone={clients.length > 0 ? "active" : "idle"}
          status={clients.length === 0 ? "None right now" : connectedSummary(clients)}
          description="Every connected browser can control NativePi."
        >
          {clients.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {clients.map((client) => (
                <li key={client.id} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-sm">{client.device}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {client.location === "remote" ? "Remote" : client.address} · {formatTime(client.connectedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </SettingsCard>
      ) : null}

      {shared || handoffs.length > 0 ? (
        <div className="border-t border-border/70">
          <button
            type="button"
            aria-expanded={auditOpen}
            onClick={() => setAuditOpen((open) => !open)}
            className="flex w-full items-center gap-3 py-6 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">The access token</span>
              <span className="mt-1 block text-sm text-body-muted-foreground">
                Where your links have been, and how to make every one of them stop working.
              </span>
            </span>
            <CaretDownIcon className={cn("shrink-0 text-muted-foreground transition-transform", auditOpen && "rotate-180")} />
          </button>

          {auditOpen ? (
            <div className="flex flex-col gap-4 border-t border-border/70 py-5">
              <div>
                <p className="text-sm font-medium">Handoffs from this window</p>
                {handoffs.length === 0 ? (
                  <p className="mt-1 text-sm text-body-muted-foreground">No link has been copied or shown yet.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {handoffs.map((handoff) => (
                      <li key={handoff.id} className="flex items-baseline justify-between gap-4">
                        <span className="min-w-0">
                          <span className="block text-sm">{describeHandoff(handoff)}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground" title={handoff.link}>
                            {handoff.link}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatClock(handoff.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {shared ? (
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-body-muted-foreground">
                    Both links carry the same token, and nothing knows who holds a copy.
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="xl"
                      disabled={Boolean(busy) || remote.state === "starting"}
                      onClick={() => setPending("replace")}
                    >
                      <ArrowsClockwiseIcon data-icon="inline-start" />
                      {busy === "replace" ? "Replacing…" : "Replace token"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="xl"
                      disabled={Boolean(busy) || remote.state === "starting"}
                      onClick={() => setPending("revoke")}
                    >
                      {busy === "revoke" ? "Revoking…" : "Revoke all access"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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
            <DialogDescription className="text-sm leading-relaxed text-body-muted-foreground">
              Point the other device's camera at this. The token is in the code, so there is nothing to type.
            </DialogDescription>
          </DialogHeader>
          {/* The code needs a light quiet zone to scan against a dark app. */}
          <div className="mx-auto rounded-md bg-qr-background p-3">
            {showing ? <QRCodeSVG value={showing.link} size={192} /> : null}
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">{showing?.link}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The link, and the two ways it leaves this window.
 *
 * The address itself is the thing someone came for, so it is a field rather than
 * a row label, wide enough to read and selectable. Copy and QR sit beside it
 * because handing an address plus a 32 character token to a phone by hand is not
 * something anyone should be asked to do.
 */
function LinkPanel({
  scope,
  link,
  note,
  copied,
  onCopy,
  onShowQr,
  addresses,
  onPickAddress,
}: {
  scope: Scope;
  link: string;
  note: string;
  copied: boolean;
  onCopy: (scope: Scope, link: string) => Promise<void>;
  onShowQr: (scope: Scope, link: string) => void;
  addresses?: string[];
  onPickAddress?: (link: string) => void;
}) {
  const choices = addresses?.map((address) => ({ value: address, label: hostname(address) })) ?? [];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {/* Titled because it truncates: the tail of a link carries the token,
            and the field showing it should not be the one place it cannot be
            read. */}
        <code
          title={link}
          className="min-w-0 flex-1 truncate rounded-md border bg-background/60 px-2.5 py-2 font-mono text-xs select-all"
        >
          {link}
        </code>
        <Button
          variant="outline"
          size="icon-lg"
          title="Show a QR code"
          aria-label="Show a QR code for this link"
          onClick={() => onShowQr(scope, link)}
        >
          <QrCodeIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          title="Copy the link"
          aria-label={copied ? "Link copied" : "Copy this link"}
          onClick={() => void onCopy(scope, link)}
        >
          <ContextualIcon active={copied} activeIcon={<CheckIcon className="text-success" />} inactiveIcon={<CopyIcon />} />
        </Button>
      </div>

      {choices.length > 1 && onPickAddress ? (
        <Select
          value={link}
          onValueChange={(next) => {
            if (typeof next === "string") onPickAddress(next);
          }}
          items={choices}
        >
          <SelectTrigger aria-label="Network address" className="w-full text-xs sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value} className="min-h-8 px-2.5 text-sm">
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <p className="text-xs leading-5 text-body-muted-foreground">
        Anyone with the complete link can control NativePi. {note}
      </p>
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
      <Button variant="destructive" size="xl" disabled={busy} onClick={() => void onRun("remote", rpc.request.stopRemoteAccess({}))}>
        <StopIcon weight="fill" data-icon="inline-start" />
        {busy ? "Working…" : "Stop"}
      </Button>
    );
  }
  if (status.state === "error") {
    return (
      <Button variant="outline" size="xl" disabled={busy} onClick={() => void onRun("remote", rpc.request.startRemoteAccess({}))}>
        <ArrowsClockwiseIcon data-icon="inline-start" />
        {busy ? "Working…" : "Try again"}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="xl"
      disabled={busy || status.state === "starting"}
      onClick={() => void onRun("remote", rpc.request.startRemoteAccess({}))}
    >
      <PlayIcon weight="fill" data-icon="inline-start" />
      {busy || status.state === "starting" ? "Starting…" : "Start"}
    </Button>
  );
}

function remoteTone(status: RemoteAccessStatus): CardTone {
  switch (status.state) {
    case "idle": return "idle";
    case "starting": return "busy";
    case "running": return status.reachable === false ? "warning" : "active";
    case "error": return "error";
  }
}

function remoteStatus(status: RemoteAccessStatus): string {
  switch (status.state) {
    case "idle": return "Not shared";
    case "starting": return "Creating a public link";
    // A tunnel that stopped routing while its client kept running is still
    // "running" to everything else here, and reads as fine until someone tries
    // the link on a phone.
    case "running": return status.reachable === false ? "Not answering" : "Reachable from anywhere";
    case "error": return "Could not start";
  }
}

function remoteDescription(status: RemoteAccessStatus): string {
  switch (status.state) {
    case "idle":
      return "Reach this window from anywhere over a temporary Cloudflare address. The first run downloads the tunnel client.";
    case "starting":
      return "Asking Cloudflare for an address.";
    case "running":
      return health(status);
    case "error":
      return "Check this computer's internet connection, then try again.";
  }
}

/**
 * What the last check of a live link found.
 *
 * The age of the reading is part of the answer: a check from a minute ago is
 * worth more than the same word with no time attached to it.
 */
function health(status: RemoteAccessStatus): string {
  if (status.reachable === undefined) return "Stop remote access when you are done.";
  const when = status.checkedAt ? `, checked ${ago(status.checkedAt)}` : "";
  return status.reachable
    ? `The address answered${when}. Stop remote access when you are done.`
    : `The address did not answer${when}. Cloudflare may still be re-routing it; stop and restart remote access if it does not clear.`;
}

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 90) return "just now";
  return `${Math.round(seconds / 60)} minutes ago`;
}

/** How many devices are connected, and over which of the two links. */
function connectedSummary(clients: AccessClient[]): string {
  const remote = clients.filter((client) => client.location === "remote").length;
  const local = clients.length - remote;
  return [
    local > 0 ? `${local} on your network` : "",
    remote > 0 ? `${remote} over the public link` : "",
  ].filter(Boolean).join(", ");
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

function hostname(link: string): string {
  try {
    return new URL(link).hostname;
  } catch {
    return link;
  }
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
