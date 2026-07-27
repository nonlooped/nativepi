import { useAppStore } from "../../lib/store.ts";
import PiPanel from "./PiPanel.tsx";
import { SettingsSection, SliderRow, SwitchRow, TextRow } from "./rows.tsx";

/**
 * Two different terminals, on one screen because the distinction is not the
 * user's problem: the integrated terminal NativePi draws, and the shell Pi runs
 * its own commands in.
 */
export default function TerminalSettings() {
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);
  const update = useAppStore((s) => s.updatePiSetting);

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        heading="Integrated terminal"
        description="The terminal panel inside NativePi. Changes apply to open terminals without losing their scrollback."
      >
        <SliderRow
          label="Font size"
          value={preferences.terminalFontSize}
          min={9}
          max={24}
          step={1}
          format={(value) => `${value}px`}
          onChange={(value) => setPreference("terminalFontSize", value)}
        />
        <SliderRow
          label="Scrollback"
          description="How many lines of output are kept for scrolling back through."
          value={preferences.terminalScrollback}
          min={500}
          max={100000}
          step={500}
          format={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
          onChange={(value) => setPreference("terminalScrollback", value)}
        />
        <SwitchRow
          label="Blink the cursor"
          checked={preferences.terminalCursorBlink}
          onChange={(value) => setPreference("terminalCursorBlink", value)}
        />
      </SettingsSection>

      <PiPanel>
        {(settings) => (
          <SettingsSection
            heading="The agent's shell"
            description="Where Pi runs the commands it decides to run. This is separate from the terminal above, and is stored in Pi's settings."
          >
            <TextRow
              label="Shell"
              description="Leave empty to let Pi choose. On Windows this is usually a path to pwsh.exe or powershell.exe."
              value={settings.shellPath}
              placeholder="Chosen by Pi"
              onCommit={(value) => void update("shellPath", value)}
            />
            <TextRow
              label="Command prefix"
              description="Prepended to every command Pi runs, for wrappers such as a sandbox or a profiler."
              value={settings.shellCommandPrefix}
              placeholder="None"
              onCommit={(value) => void update("shellCommandPrefix", value)}
            />
          </SettingsSection>
        )}
      </PiPanel>
    </div>
  );
}
