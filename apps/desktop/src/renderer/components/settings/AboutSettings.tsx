import { useState } from "react";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import type { UpdateState } from "../../../shared/rpc-schema.ts";
import { fileManagerName } from "../../lib/paths.ts";
import { isRemote, rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { showDiagnosticsCopied, showDiagnosticsExportFailed } from "../../lib/toast.tsx";
import { ActionRow, ReadonlyRow, SettingsCard, SettingsSection, type CardTone } from "./rows.tsx";
import { Button } from "@/components/ui/button.tsx";

const REPOSITORY_URL = "https://github.com/nonlooped/nativepi";

/** What the update card says, in the order the stages happen. */
function updateSummary(update: UpdateState): { tone: CardTone; status: string; detail: string } {
  const name = update.version ? `NativePi ${update.version}` : "A newer NativePi";
  switch (update.status) {
    case "checking":
      return { tone: "busy", status: "Checking for updates", detail: "Asking GitHub what the latest release is." };
    case "available":
      return { tone: "warning", status: `${name} is available`, detail: "Downloading does not interrupt anything you have running." };
    case "downloading":
      return { tone: "busy", status: `Downloading ${name}`, detail: `${update.percent ?? 0}% of the installer fetched.` };
    case "ready":
      return {
        tone: "warning",
        status: `${name} is ready`,
        detail: "Installing stops the agent and your terminals, then starts NativePi again.",
      };
    case "error":
      return { tone: "error", status: "The update did not go through", detail: update.error ?? "NativePi could not reach the release feed." };
    default:
      return {
        tone: "active",
        status: "Up to date",
        detail: "NativePi asks GitHub when it starts and every few hours after. Nothing downloads until you ask for it.",
      };
  }
}

/**
 * Updating NativePi from inside NativePi.
 *
 * Left out entirely on a development run, where there is no packaged app to
 * replace, and in a remote browser, which is not the machine the installer
 * would run on.
 */
function Updates() {
  const update = useAppStore((s) => s.update);
  const checkForUpdate = useAppStore((s) => s.checkForUpdate);
  const downloadUpdate = useAppStore((s) => s.downloadUpdate);
  const installUpdate = useAppStore((s) => s.installUpdate);

  if (isRemote || update.status === "unsupported") return null;

  const { tone, status, detail } = updateSummary(update);
  const busy = update.status === "checking" || update.status === "downloading";

  return (
    <SettingsCard
      icon={<DownloadSimpleIcon />}
      title="Updates"
      tone={tone}
      status={status}
      description={detail}
      action={
        update.status === "available" ? (
          <Button size="xl" onClick={() => void downloadUpdate()}>
            Download
          </Button>
        ) : update.status === "ready" ? (
          <Button size="xl" onClick={() => void installUpdate()}>
            Restart and install
          </Button>
        ) : (
          <Button size="xl" variant="outline" disabled={busy} onClick={() => void checkForUpdate()}>
            {busy ? "Working…" : "Check now"}
          </Button>
        )
      }
    />
  );
}

/**
 * What this is, and where Pi keeps the parts of itself this screen does not
 * reach. The paths are the useful half: Pi's configuration is a larger surface
 * than NativePi exposes, and someone who wants to hand-edit the rest should not
 * have to guess where it lives.
 */
export default function AboutSettings() {
  const versions = useRequest(() => rpc.request.versions({}), []);
  const paths = useRequest(() => rpc.request.piPaths({}), []);
  const activeProjectPath = useAppStore((state) => state.activeProjectPath);
  const [exporting, setExporting] = useState(false);

  const exportDiagnostics = async () => {
    setExporting(true);
    try {
      const result = await rpc.request.exportDiagnostics({ projectDir: activeProjectPath ?? undefined });
      if (!result.ok || !result.text) throw new Error(result.error ?? "The diagnostic report was empty.");
      await navigator.clipboard.writeText(result.text);
      showDiagnosticsCopied();
    } catch (error) {
      showDiagnosticsExportFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection heading="Version">
        <ReadonlyRow
          label="NativePi"
          value={versions.data?.app ?? "…"}
          action={
            <Button variant="ghost" size="sm" onClick={() => void rpc.request.openExternal({ url: REPOSITORY_URL })}>
              View source
            </Button>
          }
        />
        <ReadonlyRow label="Pi" value={versions.data?.pi ?? "…"} />
      </SettingsSection>

      <Updates />

      {!isRemote ? (
        <SettingsSection heading="Support">
          <ActionRow
            label="Diagnostics"
            description="Copy system details, recent logs, package state, and redacted configuration for a bug report."
          >
            <Button size="xl" variant="outline" disabled={exporting} onClick={() => void exportDiagnostics()}>
              <CopyIcon data-icon="inline-start" />
              {exporting ? "Copying…" : "Copy diagnostics"}
            </Button>
          </ActionRow>
        </SettingsSection>
      ) : null}

      <SettingsSection
        heading="Where Pi keeps things"
        description="NativePi exposes the settings most people need. Pi supports more, and its files are here."
      >
        <ReadonlyRow
          label="Configuration"
          value={paths.data?.paths.agentDir ?? "…"}
          action={
            paths.data ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title={`Show in ${fileManagerName()}`}
                aria-label={`Show the configuration folder in ${fileManagerName()}`}
                onClick={() => void rpc.request.showInFolder({ path: paths.data!.paths.agentDir })}
              >
                <FolderOpenIcon />
              </Button>
            ) : null
          }
        />
        <ReadonlyRow
          label="Settings"
          description="The file this screen writes. Shared with the Pi command line."
          value={paths.data?.paths.settingsFile ?? "…"}
          action={
            paths.data ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title={`Show in ${fileManagerName()}`}
                aria-label={`Show the settings file in ${fileManagerName()}`}
                onClick={() => void rpc.request.showInFolder({ path: paths.data!.paths.settingsFile })}
              >
                <FolderOpenIcon />
              </Button>
            ) : null
          }
        />
        <ReadonlyRow
          label="Credentials"
          description="Written by Pi. NativePi stores none of its own."
          value={paths.data?.paths.authFile ?? "…"}
        />
      </SettingsSection>
    </div>
  );
}
