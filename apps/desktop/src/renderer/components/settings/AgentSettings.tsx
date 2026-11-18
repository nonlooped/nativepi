import { useState } from "react";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import { useAppStore } from "../../lib/store.ts";
import PiPanel from "./PiPanel.tsx";
import SettingsDetails from "./SettingsDetails.tsx";
import TerminalSettings, { PiShellSettings } from "./TerminalSettings.tsx";
import { SelectRow, SwitchRow } from "./rows.tsx";

export default function AgentSettings() {
  const update = useAppStore(s => s.updatePiSetting);
  const loaded = useAppStore(s => s.piSettings);
  // Every disclosure is a sibling so the list keeps one rhythm of rows and dividers.
  return <div>
    <SettingsDetails id="runtime" title="Runtime" summary={loaded ? [
      loaded.defaultThinkingLevel ? `Default reasoning: ${loaded.defaultThinkingLevel}` : "Model chooses reasoning",
      loaded.autoCompaction ? "automatic compaction" : "compaction off",
      loaded.autoRetry ? "automatic retries" : "retries off",
    ].join(" · ") : undefined}>
      <PiPanel>{settings => <div>
        <SelectRow label="Default reasoning" description="For newly started Pi sessions. Existing chats keep their selection; change it in the composer."
          value={settings.defaultThinkingLevel} options={[
            { value: "", label: "Let the model decide" }, { value: "off", label: "Off" }, { value: "minimal", label: "Minimal" },
            { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
            { value: "xhigh", label: "Extra high" }, { value: "max", label: "Maximum" },
          ]} onChange={value => void update("defaultThinkingLevel", value)} />
        <SwitchRow label="Compact automatically" description="Summarize older messages before the context fills up." checked={settings.autoCompaction} onChange={value => void update("autoCompaction", value)} />
        <SwitchRow label="Retry failed requests" description="Retry temporary provider errors." checked={settings.autoRetry} onChange={value => void update("autoRetry", value)} />
      </div>}</PiPanel>
    </SettingsDetails>
    <SettingsDetails id="images" title="Image handling" summary={loaded ? loaded.blockImages ? "Image input disabled" : loaded.autoResizeImages ? "Optimize large images" : "Send original images" : undefined}>
      <PiPanel>{settings => <ImageInputSettings settings={settings} />}</PiPanel>
    </SettingsDetails>
    <SettingsDetails id="terminal" title="Terminal" summary="Font, cursor, and scrollback for the integrated terminal."><TerminalSettings /></SettingsDetails>
    <SettingsDetails id="shell" title="Pi shell" summary="Executable and command prefix used by Pi’s command tool."><PiShellSettings /></SettingsDetails>
  </div>;
}

function ImageInputSettings({ settings }: { settings: PiSettings }) {
  const update = useAppStore(s => s.updatePiSetting);
  const [saving, setSaving] = useState(false);
  return <SelectRow label="Image input" description="Controls images attached to messages for supported models."
    value={settings.blockImages ? "off" : settings.autoResizeImages ? "optimize" : "original"} disabled={saving}
    options={[{ value: "off", label: "Disabled" }, { value: "optimize", label: "Optimize large images" }, { value: "original", label: "Original size" }]}
    onChange={async value => {
      setSaving(true);
      try {
        // Keep the dormant resize choice when disabling image input. Finish
        // saving resize before unblocking so intermediate state stays safe.
        if (value !== "off" && settings.autoResizeImages !== (value === "optimize")) {
          await update("autoResizeImages", value === "optimize");
          if (useAppStore.getState().piSettings?.autoResizeImages !== (value === "optimize")) return;
        }
        await update("blockImages", value === "off");
      } finally { setSaving(false); }
    }} />;
}
