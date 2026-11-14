import { useAppStore } from "../../lib/store.ts";
import { SettingsSection, SwitchRow } from "./rows.tsx";

export default function GeneralSettings() {
  const reopenLastProject = useAppStore((s) => s.reopenLastProject);
  const setReopenLastProject = useAppStore((s) => s.setReopenLastProject);
  const notifyOnTurnEnd = useAppStore((s) => s.preferences.notifyOnTurnEnd);
  const promptSuggestions = useAppStore((s) => s.preferences.promptSuggestions);
  const notificationSound = useAppStore((s) => s.preferences.notificationSound);
  const setPreference = useAppStore((s) => s.setPreference);

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection heading="Composer">
        <SwitchRow
          label="Suggest next message"
          description="Offer a short reply after Pi finishes. Uses an extra request to your current model. Press Tab to accept or Escape to dismiss."
          checked={promptSuggestions}
          onChange={(value) => setPreference("promptSuggestions", value)}
        />
      </SettingsSection>
      <SettingsSection heading="Notifications">
        <SwitchRow
          label="Notify when a turn finishes"
          description="Show a desktop notification when a background turn finishes."
          checked={notifyOnTurnEnd}
          onChange={(value) => setPreference("notifyOnTurnEnd", value)}
        />
        <SwitchRow
          label="Play a sound"
          checked={notificationSound}
          onChange={(value) => setPreference("notificationSound", value)}
          disabled={!notifyOnTurnEnd}
        />
      </SettingsSection>
      <SettingsSection heading="Startup">
        <SwitchRow
          label="Reopen last project"
          description="Return to the project you were working in when NativePi starts."
          checked={reopenLastProject}
          onChange={setReopenLastProject}
        />
      </SettingsSection>
    </div>
  );
}
