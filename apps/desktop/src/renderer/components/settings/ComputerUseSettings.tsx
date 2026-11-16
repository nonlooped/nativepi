import { useEffect, useState } from "react";
import { computerStatusSchema, type ComputerStatus } from "../../../shared/computer-use.ts";
import { rpc, isRemote } from "../../lib/rpc.ts";
import { Button } from "../ui/button.tsx";
import { SettingsSection, SettingsCard } from "./rows.tsx";

const permissionNames: Record<string, string> = { accessibility: "Accessibility", screen_recording: "Screen recording" };

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
  const missing = status?.available ? Object.entries(permissionNames)
    .filter(([key]) => !["granted", "not_required"].includes(status.permissions[key]?.state ?? "unknown"))
    .map(([, name]) => name) : [];
  const ready = status?.available && !missing.length;
  return (
    <SettingsSection heading="Computer use" description="Work chats can interact with apps on this computer.">
      <SettingsCard title="System permissions"
        status={!status ? "Checking permissions…" : status.error ? "Computer use unavailable" : ready ? "Ready to use" : "System permission needed"}
        tone={!status ? "busy" : status.error ? "error" : ready ? "active" : "warning"}
        description={missing.length ? `Allow ${missing.join(" and ")} for NativePi in system settings.` : undefined}
        error={status?.error}
        action={<div className="flex flex-wrap gap-2">
          {status?.platform === "macos" && missing.length > 0 && !isRemote ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh(true)}>Open permission guide</Button> : null}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Check again"}</Button>
        </div>} />
      {guideOpened && !ready ? <p role="status" className="pb-2 text-[0.8125rem] leading-5 text-body-muted-foreground">Complete the permission guide, then check again.</p> : null}
      {isRemote && missing.length > 0 ? <p className="pb-2 text-[0.8125rem] leading-5 text-body-muted-foreground">Grant permissions on the host computer in the desktop app.</p> : null}
      <p className="pb-3 text-[0.8125rem] leading-5 text-body-muted-foreground">App content and screenshots go to your model provider and stay in chat history. Stop interrupts this chat’s actions.</p>
    </SettingsSection>
  );
}
