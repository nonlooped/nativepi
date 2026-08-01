import { useAppStore } from "../../lib/store.ts";
import { osName } from "../../lib/platform.ts";
import { ChoiceCards, ChoiceRow, SettingsSection, SliderRow } from "./rows.tsx";

/** A stack of fake message lines, used to draw the width and diff previews. */
function Lines({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <span className={className}>
      {widths.map((width, index) => (
        <span key={index} className="block h-1 rounded-full bg-current" style={{ width, marginTop: index ? 3 : 0 }} />
      ))}
    </span>
  );
}

function WidthPreview({ width }: { width: string }) {
  return (
    <span className="flex w-full justify-center text-muted-foreground/60">
      <span style={{ width }}>
        <Lines widths={["100%", "80%", "92%"]} />
      </span>
    </span>
  );
}

export default function AppearanceSettings() {
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);
  // Named rather than hard-coded: this screen is also served to a phone over
  // Remote Access, where "Follow Windows" would be describing someone else's
  // machine and pointing at a setting the reader cannot find.
  const system = osName();

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection heading="Layout">
        <ChoiceCards
          label="Conversation width"
          description="How far messages, diffs and the composer may spread on a wide window."
          value={preferences.conversationWidth}
          options={[
            { value: "narrow", label: "Narrow", preview: <WidthPreview width="40%" /> },
            { value: "medium", label: "Medium", preview: <WidthPreview width="60%" /> },
            { value: "wide", label: "Wide", preview: <WidthPreview width="80%" /> },
            { value: "full", label: "Fill the window", preview: <WidthPreview width="100%" /> },
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
        <ChoiceCards
          label="Diff layout"
          description="Applies to file changes in the transcript and in the changes pane. A narrow window falls back to unified either way."
          value={preferences.diffStyle}
          options={[
            {
              value: "unified",
              label: "Unified",
              preview: (
                <span className="w-full">
                  <Lines widths={["70%", "90%", "55%", "80%"]} className="block text-destructive/50" />
                </span>
              ),
            },
            {
              value: "split",
              label: "Side by side",
              preview: (
                <span className="flex w-full gap-1.5">
                  <Lines widths={["80%", "60%", "90%", "70%"]} className="block flex-1 text-destructive/50" />
                  <Lines widths={["70%", "85%", "50%", "80%"]} className="block flex-1 text-success/50" />
                </span>
              ),
            },
          ]}
          onChange={(value) => setPreference("diffStyle", value)}
        />
      </SettingsSection>

      <SettingsSection heading="Motion">
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
    </div>
  );
}
