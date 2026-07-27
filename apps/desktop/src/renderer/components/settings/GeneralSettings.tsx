import { useAppStore } from "../../lib/store.ts";
import { SettingsSection, SwitchRow } from "./rows.tsx";

export default function GeneralSettings() {
  const reopenLastProject = useAppStore((s) => s.reopenLastProject);
  const setReopenLastProject = useAppStore((s) => s.setReopenLastProject);
  const notifyOnTurnEnd = useAppStore((s) => s.preferences.notifyOnTurnEnd);
  const notificationSound = useAppStore((s) => s.preferences.notificationSound);
  const setPreference = useAppStore((s) => s.setPreference);

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
        heading="Notifications"
        description="NativePi only notifies you when its window is in the background, so a run you are watching never interrupts itself."
      >
        <SwitchRow
          label="Notify when a turn finishes"
          description="Show a desktop notification with how long the run took and how many files changed."
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
