import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import type { UpdateState } from "../../../shared/rpc-schema.ts";
import { isRemote, rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import { useRequest } from "../../lib/useRequest.ts";
import NativePiWordmark from "../NativePiWordmark.tsx";
import { ActionRow, ReadonlyRow, SettingsSection } from "./rows.tsx";
import { Button } from "@/components/ui/button.tsx";

const REPOSITORY_URL = "https://github.com/nonlooped/nativepi";

/** What the update row says, in the order the stages happen. */
function updateSummary(update: UpdateState, currentVersion: string | undefined): { headline: string; detail: string } {
  const name = update.version ? `NativePi ${update.version}` : "A newer NativePi";
  switch (update.status) {
    case "checking":
      return { headline: "Checking for updates", detail: "Asking GitHub what the latest release is." };
    case "available":
      return { headline: `${name} is available`, detail: "Downloading it does not interrupt anything you have running." };
    case "downloading":
      return { headline: `Downloading ${name}`, detail: `${update.percent ?? 0}% of the installer fetched.` };
    case "ready":
      return {
        headline: `${name} is ready to install`,
        detail: "NativePi stops the agent and your terminals, installs it, and starts again.",
      };
    case "error":
      return { headline: "The update did not go through", detail: update.error ?? "NativePi could not reach the release feed." };
    default:
      return {
        headline: "NativePi is up to date",
        detail: currentVersion ? `You are running ${currentVersion}.` : "No newer release has been published.",
      };
  }
}

/**
 * Updating NativePi from inside NativePi.
 *
 * The same three actions the notification offers, in the one place someone
 * looks when they want to update on purpose rather than when asked. Left out
 * entirely on a development run, where there is no packaged app to replace, and
 * in a remote browser, which is not the machine the installer would run on.
 */
function Updates({ currentVersion }: { currentVersion: string | undefined }) {
  const update = useAppStore((s) => s.update);
  const checkForUpdate = useAppStore((s) => s.checkForUpdate);
  const downloadUpdate = useAppStore((s) => s.downloadUpdate);
  const installUpdate = useAppStore((s) => s.installUpdate);

  if (isRemote || update.status === "unsupported") return null;

  const { headline, detail } = updateSummary(update, currentVersion);
  const busy = update.status === "checking" || update.status === "downloading";

  return (
    <SettingsSection
      heading="Updates"
      description="NativePi looks for a new release on GitHub when it starts and every few hours after that. Nothing is downloaded until you ask for it. The builds are not code signed, so the installer's signature is not checked."
    >
      <ActionRow label={headline} description={detail}>
        {update.status === "available" ? (
          <Button size="sm" onClick={() => void downloadUpdate()}>
            Download update
          </Button>
        ) : update.status === "ready" ? (
          <Button size="sm" onClick={() => void installUpdate()}>
            Restart and install
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void checkForUpdate()}>
            {update.status === "checking" ? "Checking…" : update.status === "downloading" ? "Downloading…" : "Check for updates"}
          </Button>
        )}
      </ActionRow>
    </SettingsSection>
  );
}

/**
 * What this is, what it is built on, and where it keeps things.
 *
 * The paths are the useful part: Pi's configuration is a larger surface than
 * NativePi exposes, and someone who wants to hand-edit the rest should not have
 * to guess where Pi put it.
 */
export default function AboutSettings() {
  const versions = useRequest(() => rpc.request.versions({}), []);
  const paths = useRequest(() => rpc.request.piPaths({}), []);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <NativePiWordmark display />
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">
          Pi runs the agent and owns your providers, credentials and sessions. NativePi gives it a window. Everything
          stays on this computer.
        </p>
      </div>

      <SettingsSection heading="Versions">
        <ReadonlyRow label="NativePi" value={versions.data?.app ?? "…"} />
        <ReadonlyRow label="Pi" value={versions.data?.pi ?? "…"} />
      </SettingsSection>

      <Updates currentVersion={versions.data?.app} />

      <SettingsSection
        heading="Where Pi keeps things"
        description="NativePi exposes the settings most people need. Pi supports more than that, and its files are here if you want to edit them directly."
      >
        <ReadonlyRow
          label="Configuration"
          value={paths.data?.paths.agentDir ?? "…"}
          action={
            paths.data ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Show in Explorer"
                aria-label="Show the configuration folder in Explorer"
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
                title="Show in Explorer"
                aria-label="Show the settings file in Explorer"
                onClick={() => void rpc.request.showInFolder({ path: paths.data!.paths.settingsFile })}
              >
                <FolderOpenIcon />
              </Button>
            ) : null
          }
        />
        <ReadonlyRow
          label="Credentials"
          description="Written by Pi when you connect a provider. NativePi never stores credentials of its own."
          value={paths.data?.paths.authFile ?? "…"}
        />
      </SettingsSection>

      <SettingsSection heading="Project">
        <ReadonlyRow
          label="Source"
          description="NativePi is free and MIT licensed."
          value={REPOSITORY_URL}
          action={
            <Button variant="ghost" size="sm" onClick={() => void rpc.request.openExternal({ url: REPOSITORY_URL })}>
              Open
            </Button>
          }
        />
      </SettingsSection>
    </div>
  );
}
