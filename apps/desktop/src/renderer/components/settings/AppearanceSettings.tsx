import { useAppStore } from "../../lib/store.ts";
import { SelectRow, SettingsSection, SliderRow } from "./rows.tsx";

export default function AppearanceSettings() {
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection heading="Layout">
        <SelectRow
          label="Conversation width"
          description="How far messages, diffs and the composer may spread on a wide window."
          value={preferences.conversationWidth}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "medium", label: "Medium" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Fill the window" },
          ]}
          onChange={(value) => setPreference("conversationWidth", value)}
        />
        <SliderRow
          label="Interface scale"
          description="Scales text, spacing and controls throughout NativePi."
          value={preferences.interfaceScale}
          min={0.8}
          max={1.4}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => setPreference("interfaceScale", value)}
        />
      </SettingsSection>

      <SettingsSection heading="Diffs">
        <SelectRow
          label="Diff layout"
          description="Applies to file changes in the transcript and in the changes pane."
          value={preferences.diffStyle}
          options={[
            { value: "unified", label: "Unified" },
            { value: "split", label: "Side by side" },
          ]}
          onChange={(value) => setPreference("diffStyle", value)}
        />
      </SettingsSection>

      <SettingsSection heading="Motion">
        <SelectRow
          label="Animation"
          description="NativePi follows Windows' reduced-motion setting unless you override it here."
          value={preferences.reducedMotion}
          options={[
            { value: "system", label: "Follow Windows" },
            { value: "always", label: "Always reduce" },
            { value: "never", label: "Never reduce" },
          ]}
          onChange={(value) => setPreference("reducedMotion", value)}
        />
      </SettingsSection>
    </div>
  );
}
