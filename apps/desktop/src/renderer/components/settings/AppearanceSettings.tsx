import { MIN_INTERFACE_SCALE, MAX_INTERFACE_SCALE, INTERFACE_SCALE_STEP } from "../../../shared/interface-scale.ts";
import { useAppStore } from "../../lib/store.ts";
import { osName } from "../../lib/platform.ts";
import { ChoiceRow, SettingsSection, SliderRow } from "./rows.tsx";
import ThemeSettings from "./ThemeSettings.tsx";
import ChatBackgroundSettings from "./ChatBackgroundSettings.tsx";

export default function AppearanceSettings() {
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);
  // Named rather than hard-coded: this screen is also served to a phone over
  // Remote Access, where "Follow Windows" would be describing someone else's
  // machine and pointing at a setting the reader cannot find.
  const system = osName();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection heading="Interface">
        <ChoiceRow
          label="Light & dark"
          value={preferences.theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(value) => setPreference("theme", value)}
        />
        <SliderRow
          label="Interface scale"
          description="Scale text, spacing, and controls."
          value={preferences.interfaceScale}
          min={MIN_INTERFACE_SCALE}
          max={MAX_INTERFACE_SCALE}
          step={INTERFACE_SCALE_STEP}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => setPreference("interfaceScale", value)}
        />
        <ChoiceRow
          label="Conversation width"
          description="Width of messages and the composer."
          value={preferences.conversationWidth}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "medium", label: "Medium" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
          ]}
          onChange={(value) => setPreference("conversationWidth", value)}
        />

        <ChoiceRow
          label="Diff layout"
          description="Narrow windows always use unified diffs."
          value={preferences.diffStyle}
          options={[
            { value: "unified", label: "Unified" },
            { value: "split", label: "Side by side" },
          ]}
          onChange={(value) => setPreference("diffStyle", value)}
        />
        <ChoiceRow
          label="Animation"
          description={`NativePi follows the reduced-motion setting in ${system} unless you override it here.`}
          value={preferences.reducedMotion}
          options={[
            { value: "system", label: `Follow ${system}` },
            { value: "always", label: "Reduce" },
            { value: "never", label: "Full" },
          ]}
          onChange={(value) => setPreference("reducedMotion", value)}
        />
      </SettingsSection>

      <SettingsSection heading="Colors">
        <ThemeSettings />
      </SettingsSection>

      <ChatBackgroundSettings />
    </div>
  );
}
