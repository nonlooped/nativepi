import BackgroundServiceSettings from "./BackgroundServiceSettings.tsx";
import { useAppStore } from "../../lib/store.ts";
import { SelectRow, SettingsSection, SwitchRow } from "./rows.tsx";

export default function GeneralSettings() {
  const reopen = useAppStore(s => s.reopenLastProject);
  const setReopen = useAppStore(s => s.setReopenLastProject);
  const notify = useAppStore(s => s.preferences.notifyOnTurnEnd);
  const sound = useAppStore(s => s.preferences.notificationSound);
  const setPreference = useAppStore(s => s.setPreference);
  return <div className="flex flex-col gap-7">
    <BackgroundServiceSettings />
    <SettingsSection id="startup" heading="Startup">
      <SwitchRow label="Reopen last project" description="Return to your last project when NativePi starts." checked={reopen} onChange={setReopen} />
    </SettingsSection>
    <SettingsSection id="notifications" heading="Notifications">
      <SelectRow label="Background turn notifications" description="When Pi finishes while you’re working elsewhere."
        value={!notify ? "off" : sound ? "sound" : "notification"}
        options={[{ value: "off", label: "Off" }, { value: "notification", label: "Notification" }, { value: "sound", label: "Notification and sound" }]}
        onChange={value => {
          setPreference("notifyOnTurnEnd", value !== "off");
          // Turning notifications off does not discard the remembered sound choice.
          if (value !== "off") setPreference("notificationSound", value === "sound");
        }} />
    </SettingsSection>
  </div>;
}
