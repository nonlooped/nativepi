import { useEffect, useState } from "react";
import { MonitorIcon } from "@phosphor-icons/react/Monitor";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { computerStatusSchema, type ComputerStatus } from "../../../shared/computer-use.ts";
import { rpc, isRemote } from "../../lib/rpc.ts";
import { Button } from "../ui/button.tsx";
import { SettingsSection } from "./rows.tsx";

const permissionNames: Record<string, string> = { accessibility: "Accessibility", screen_recording: "Screen recording", automation: "Automation" };
const permissionDescriptions: Record<string, string> = {
  accessibility: "Read app controls and interact with them.",
  screen_recording: "Capture app windows and displays for visual checks.",
  automation: "Control apps that require system automation. Requested when needed.",
};

export default function ComputerUseSettings() {
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [guideOpened, setGuideOpened] = useState(false);
  async function refresh(guide = false) {
    setBusy(true);
    try {
      const result = computerStatusSchema.parse(await (guide ? rpc.request.computerPermissions({}) : rpc.request.computerStatus({})));
      setStatus(result);
      if (guide && !result.error) setGuideOpened(true);
    } catch { setStatus({ available: false, permissions: {}, error: "Could not check computer use. Try checking again." }); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const ready = status?.available && status.permissions.accessibility?.state === "granted";
  const missing = status && Object.values(status.permissions).some(permission => permission.state === "denied" || permission.state === "not_determined");
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection heading="Desktop access" description="Ask Pi to work in apps on this computer. Available in Work chats, including chats without a project.">
        <div className="flex items-start gap-3 py-4">
          <MonitorIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{!status ? "Checking computer use…" : status.error ? "Computer use needs attention" : ready ? "Ready to use" : "System permission needed"}</p>
            <p className="mt-1 text-[0.8125rem] leading-5 text-body-muted-foreground">
              {status?.error ?? "Pi can read app controls, capture screenshots, and use the mouse and keyboard. One chat controls the computer at a time."}
            </p>
            {status?.version ? <p className="mt-2 text-xs text-muted-foreground">agent-desktop {status.version} · Included with NativePi</p> : null}
          </div>
          {ready ? <CheckCircleIcon weight="fill" className="mt-0.5 size-5 shrink-0 text-success" /> : null}
        </div>
      </SettingsSection>
      <SettingsSection heading="System permissions" description={status?.platform === "macos" ? "Grant permissions to NativePi in System Settings. Development builds appear as Electron. Only you can approve system permission requests." : "Computer use follows the permissions and desktop capabilities of your operating system."}>
        {Object.entries(status?.permissions ?? {}).map(([name, permission]) => (
          <div key={name} className="flex items-center justify-between gap-4 border-b border-border/30 py-3 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{permissionNames[name] ?? name}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-5 text-body-muted-foreground">{permissionDescriptions[name]}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{permission.state === "granted" ? "Granted" : permission.state === "unknown" ? "When needed" : permission.state === "denied" ? "Not granted" : permission.state.replaceAll("_", " ")}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-4">
          {status?.platform === "macos" && (!ready || missing) ? <Button size="sm" disabled={busy || isRemote} onClick={() => void refresh(true)}>Open permission guide</Button> : null}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Check again"}</Button>
        </div>
        {guideOpened ? <p role="status" className="pt-3 text-[0.8125rem] leading-5 text-body-muted-foreground">Complete the permission guide, then check again. You can keep NativePi open.</p> : null}
        {isRemote ? <p className="pt-3 text-[0.8125rem] leading-5 text-body-muted-foreground">These permissions apply to the host computer. Grant them from the desktop app.</p> : null}
      </SettingsSection>
      <SettingsSection heading="While Pi works">
        <p className="py-3 text-[0.8125rem] leading-5 text-body-muted-foreground">Mouse and keyboard actions can move your pointer and change the focused app. Use Stop in the active chat to interrupt computer use. Actions already delivered to an app may have taken effect.</p>
        <p className="text-[0.8125rem] leading-5 text-body-muted-foreground">Screenshots and app content used by Pi are sent to your selected model provider and saved in the chat’s Pi session.</p>
      </SettingsSection>
    </div>
  );
}
