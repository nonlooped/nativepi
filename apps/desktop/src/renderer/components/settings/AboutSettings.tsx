import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { rpc } from "../../lib/rpc.ts";
import { useRequest } from "../../lib/useRequest.ts";
import NativePiWordmark from "../NativePiWordmark.tsx";
import { ReadonlyRow, SettingsSection } from "./rows.tsx";
import { Button } from "@/components/ui/button.tsx";

const REPOSITORY_URL = "https://github.com/nonlooped/nativepi";

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
