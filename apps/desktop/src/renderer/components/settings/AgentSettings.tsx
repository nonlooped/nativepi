import { useAppStore } from "../../lib/store.ts";
import PiPanel from "./PiPanel.tsx";
import { ChoiceRow, SelectRow, SettingsSection, SwitchRow } from "./rows.tsx";

/** The small set of Pi defaults that materially change everyday turns. */
export default function AgentSettings() {
  const update = useAppStore((state) => state.updatePiSetting);

  return (
    <PiPanel>
      {(settings) => (
        <>
          <SettingsSection heading="Defaults" description="Applied when a new chat starts.">
            <SelectRow
              label="Reasoning level"
              description="How hard a supported model thinks before answering."
              value={settings.defaultThinkingLevel}
              options={[
                { value: "", label: "Let the model decide" },
                { value: "off", label: "Off" },
                { value: "minimal", label: "Minimal" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "xhigh", label: "Extra high" },
                { value: "max", label: "Maximum" },
              ]}
              onChange={(value) => void update("defaultThinkingLevel", value)}
            />
            <SwitchRow
              label="Hide reasoning"
              description="Show answers and tool activity without the model's thinking blocks."
              checked={settings.hideThinkingBlock}
              onChange={(value) => void update("hideThinkingBlock", value)}
            />
          </SettingsSection>

          <SettingsSection heading="Reliability">
            <SwitchRow
              label="Compact automatically"
              description="Summarize older messages before a chat reaches the model's context limit."
              checked={settings.autoCompaction}
              onChange={(value) => void update("autoCompaction", value)}
            />
            <SwitchRow
              label="Retry failed requests"
              description="Retry temporary provider errors before surfacing them."
              checked={settings.autoRetry}
              onChange={(value) => void update("autoRetry", value)}
            />
          </SettingsSection>

          <SettingsSection heading="Images">
            <SwitchRow
              label="Allow images"
              description="Let supported models read images attached to messages."
              checked={!settings.blockImages}
              onChange={(value) => void update("blockImages", !value)}
            />
            <SwitchRow
              label="Resize before sending"
              description="Shrink large images so they use fewer tokens."
              checked={settings.autoResizeImages}
              onChange={(value) => void update("autoResizeImages", value)}
              disabled={settings.blockImages}
            />
          </SettingsSection>

          <SettingsSection
            heading="Project trust"
            description="A trusted folder may load project extensions, skills, and settings with your permissions."
          >
            <ChoiceRow
              label="New project folders"
              description="What Pi assumes the first time it opens a folder."
              value={settings.defaultProjectTrust}
              options={[
                { value: "ask", label: "Ask" },
                { value: "always", label: "Always trust" },
                { value: "never", label: "Never trust" },
              ]}
              onChange={(value) => void update("defaultProjectTrust", value)}
            />
          </SettingsSection>
        </>
      )}
    </PiPanel>
  );
}
