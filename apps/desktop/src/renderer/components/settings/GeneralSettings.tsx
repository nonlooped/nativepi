import { useState } from "react";
import { BellIcon } from "@phosphor-icons/react/Bell";
import { PowerIcon } from "@phosphor-icons/react/Power";
import { Button } from "@/components/ui/button.tsx";
import { useAppStore } from "../../lib/store.ts";
import ModelSelector from "../ModelSelector.tsx";
import { SettingsCard, SettingsSection, SwitchRow } from "./rows.tsx";

type Permission = NotificationPermission | "unsupported";

function currentPermission(): Permission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export default function GeneralSettings() {
  const reopenLastProject = useAppStore((s) => s.reopenLastProject);
  const setReopenLastProject = useAppStore((s) => s.setReopenLastProject);
  const notifyOnTurnEnd = useAppStore((s) => s.preferences.notifyOnTurnEnd);
  const notificationSound = useAppStore((s) => s.preferences.notificationSound);
  const setPreference = useAppStore((s) => s.setPreference);
  const titleGeneratorModel = useAppStore((s) => s.titleGeneratorModel);
  const setTitleGeneratorModel = useAppStore((s) => s.setTitleGeneratorModel);

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection heading="Startup">
        <SwitchRow
          label="Reopen last project"
          description="Return to the project you were working in when NativePi starts."
          checked={reopenLastProject}
          onChange={setReopenLastProject}
        />
      </SettingsSection>

      <SettingsSection
        heading="Chat titles"
        description="NativePi asks Pi for a short title after your first message. Choose a smaller model to keep this request inexpensive."
      >
        <div className="flex flex-col gap-3 border-t py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-sm font-medium">Title generator</p>
            <p className="text-sm leading-5 text-muted-foreground">Uses the models Pi makes available for the current project.</p>
          </div>
          <ModelSelector
            selectedKey={titleGeneratorModel}
            onSelectionChange={setTitleGeneratorModel}
            showChatModelOption
          />
        </div>
      </SettingsSection>

      <SettingsSection heading="Notifications">
        <NotificationCard enabled={notifyOnTurnEnd} silent={!notificationSound} />
        <SwitchRow
          label="Notify when a turn finishes"
          description="Only while the window is in the background, so a run you are watching never interrupts itself."
          checked={notifyOnTurnEnd}
          onChange={(value) => setPreference("notifyOnTurnEnd", value)}
        />
        <SwitchRow
          label="Play a sound"
          description="Use your system's notification sound instead of a silent notification."
          checked={notificationSound}
          onChange={(value) => setPreference("notificationSound", value)}
          disabled={!notifyOnTurnEnd}
        />
      </SettingsSection>
    </div>
  );
}

/**
 * Whether a notification would actually arrive, and proof of it.
 *
 * The switch below is a preference; this is the permission, and the two can
 * disagree. Turning the switch on while the system has blocked notifications
 * produces a setting that reads as enabled and does nothing at all, which is the
 * one failure a settings screen should never hide. The test button is the only
 * honest way to check: it puts a real notification on screen, sound and all.
 */
function NotificationCard({ enabled, silent }: { enabled: boolean; silent: boolean }) {
  const [permission, setPermission] = useState<Permission>(currentPermission);

  const send = async () => {
    if (typeof Notification === "undefined") return;
    const granted = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(granted);
    if (granted !== "granted") return;
    new Notification("NativePi", { body: "This is what a finished turn looks like.", silent });
  };

  if (permission === "unsupported") {
    return (
      <SettingsCard
        icon={<BellIcon />}
        title="Desktop notifications"
        tone="warning"
        status="Not available here"
        description="This browser does not offer notifications, so a finished turn cannot announce itself. The NativePi window on your computer still can."
      />
    );
  }

  const blocked = permission === "denied";
  const off = !enabled && !blocked;

  return (
    <SettingsCard
      icon={blocked ? <PowerIcon /> : <BellIcon />}
      title="Desktop notifications"
      tone={blocked ? "error" : off ? "idle" : permission === "granted" ? "active" : "warning"}
      status={
        blocked
          ? "Blocked by your system"
          : off
            ? "Turned off below"
            : permission === "granted"
              ? "Allowed"
              : "Permission not asked for yet"
      }
      description={
        blocked
          ? "Allow NativePi in your system's notification settings. Until then, nothing below can put one on screen."
          : "Send one now to check that it arrives, and that it sounds the way you want."
      }
      action={
        <Button variant="outline" size="lg" disabled={blocked} onClick={() => void send()}>
          Send a test
        </Button>
      }
    />
  );
}
