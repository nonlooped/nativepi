import { useEffect, useState } from "react";
import { MonitorIcon } from "@phosphor-icons/react/Monitor";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { computerStatusSchema, type ComputerStatus } from "../../../shared/computer-use.ts";
import { rpc, isRemote } from "../../lib/rpc.ts";
import { Button } from "../ui/button.tsx";
import { SettingsSection } from "./rows.tsx";

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
    <SettingsSection heading="Computer use" description="Work chats can use apps on this computer. Actions on shared windows and physical input take turns automatically.">
      <div className="flex flex-wrap items-start justify-between gap-3 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {ready ? <CheckCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-success" /> : <MonitorIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p role="status" className="text-sm font-medium">{!status ? "Checking permissions…" : status.error ? "Computer use unavailable" : ready ? "Ready to use" : "System permission needed"}</p>
            {status?.error || missing.length ? <p className="mt-1 text-[0.8125rem] leading-5 text-body-muted-foreground">{status?.error ?? `Allow ${missing.join(" and ")} for NativePi in system settings.`}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status?.platform === "macos" && missing.length > 0 && !isRemote ? <Button size="sm" disabled={busy} onClick={() => void refresh(true)}>Open permission guide</Button> : null}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Check again"}</Button>
        </div>
      </div>
      {guideOpened && !ready ? <p role="status" className="pb-2 text-[0.8125rem] leading-5 text-body-muted-foreground">Complete the permission guide, then check again.</p> : null}
      {isRemote && missing.length > 0 ? <p className="pb-2 text-[0.8125rem] leading-5 text-body-muted-foreground">Grant permissions on the host computer in the desktop app.</p> : null}
      <p className="pb-3 text-[0.8125rem] leading-5 text-body-muted-foreground">App content and screenshots go to your model provider and stay in chat history. Stop interrupts this chat’s actions.</p>
    </SettingsSection>
  );
}
