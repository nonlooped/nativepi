import { useAppStore } from "../../lib/store.ts";
import ComputerUseSettings from "./ComputerUseSettings.tsx";
import PiPanel from "./PiPanel.tsx";
import { ChoiceRow, SettingsSection } from "./rows.tsx";

export default function PermissionsSettings() {
  const update = useAppStore(s => s.updatePiSetting);
  return <div className="flex flex-col gap-7">
    <div data-setting="computer-use"><ComputerUseSettings /></div>
    <PiPanel>{settings => <SettingsSection id="trust" heading="Project trust">
      <ChoiceRow label="New project folders" description="Trusted folders can load local code, extensions, and skills with your permissions. Ask is recommended."
        value={settings.defaultProjectTrust} options={[{ value: "ask", label: "Ask" }, { value: "always", label: "Always trust" }, { value: "never", label: "Never trust" }]}
        onChange={value => void update("defaultProjectTrust", value)} />
    </SettingsSection>}</PiPanel>
  </div>;
}
