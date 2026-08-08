import { useAppStore } from "../../lib/store.ts";
import { osName } from "../../lib/platform.ts";
import { cn } from "@/lib/utils.ts";
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

/** Diff lines with their own tones, so the picture is of a diff and not of a deletion. */
function DiffLines({ lines }: { lines: { width: string; tone: "added" | "removed" | "context" }[] }) {
  return (
    <span className="block">
      {lines.map((line, index) => (
        <span
          key={index}
          className={cn(
            "block h-1 rounded-full",
            line.tone === "added" ? "bg-success/50" : line.tone === "removed" ? "bg-destructive/50" : "bg-current",
          )}
          style={{ width: line.width, marginTop: index ? 3 : 0 }}
        />
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
      <SettingsSection heading="Theme">
        <ChoiceRow
          label="Appearance"
          description={`Choose how NativePi looks. System follows the ${system} setting.`}
          value={preferences.theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(value) => setPreference("theme", value)}
        />
      </SettingsSection>

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
              // One column, removals and additions interleaved. Drawing all four
              // lines in the removal tone made the picture of a unified diff a
              // picture of a file being deleted.
              label: "Unified",
              preview: (
                <span className="w-full text-muted-foreground/60">
                  <DiffLines
                    lines={[
                      { width: "70%", tone: "context" },
                      { width: "90%", tone: "removed" },
                      { width: "55%", tone: "added" },
                      { width: "80%", tone: "context" },
                    ]}
                  />
                </span>
              ),
            },
            {
              value: "split",
              label: "Side by side",
              preview: (
                <span className="flex w-full gap-1.5 text-muted-foreground/60">
                  <span className="flex-1">
                    <DiffLines
                      lines={[
                        { width: "80%", tone: "context" },
                        { width: "60%", tone: "removed" },
                        { width: "90%", tone: "removed" },
                        { width: "70%", tone: "context" },
                      ]}
                    />
                  </span>
                  <span className="flex-1">
                    <DiffLines
                      lines={[
                        { width: "70%", tone: "context" },
                        { width: "85%", tone: "added" },
                        { width: "50%", tone: "added" },
                        { width: "80%", tone: "context" },
                      ]}
                    />
                  </span>
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
