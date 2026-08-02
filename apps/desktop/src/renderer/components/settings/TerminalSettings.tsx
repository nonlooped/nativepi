import { useAppStore } from "../../lib/store.ts";
import PiPanel from "./PiPanel.tsx";
import { SettingsSection, SliderRow, SwitchRow, TextRow } from "./rows.tsx";

/** The same stack `TerminalDock` hands to xterm, so the preview is not a guess. */
const TERMINAL_FONT = "Consolas, 'Cascadia Mono', ui-monospace, monospace";

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
        <TerminalPreview
          fontSize={preferences.terminalFontSize}
          cursorBlink={preferences.terminalCursorBlink}
          scrollback={preferences.terminalScrollback}
        />
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
              description="Leave empty to let Pi choose. On Windows this is usually a path to pwsh.exe or powershell.exe; elsewhere it is usually your default shell."
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

/**
 * The three settings below, applied to something that looks like a terminal.
 *
 * Font size in particular is unreadable as a number: 13 and 15 mean nothing
 * until they are two different-sized lines of the actual typeface, at which
 * point the choice takes a second rather than four round trips to the panel.
 */
function TerminalPreview({
  fontSize,
  cursorBlink,
  scrollback,
}: {
  fontSize: number;
  cursorBlink: boolean;
  scrollback: number;
}) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border bg-background/60">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Preview</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {fontSize}px · {scrollback.toLocaleString()} lines
        </span>
      </div>
      <div className="overflow-hidden p-3 leading-relaxed" style={{ fontFamily: TERMINAL_FONT, fontSize }}>
        <p className="whitespace-pre text-muted-foreground">
          <span className="text-active">~/projects/nativepi</span> $ git status --short
        </p>
        <p className="whitespace-pre text-warning">{" M apps/desktop/src/renderer/index.css"}</p>
        <p className="whitespace-pre text-muted-foreground">
          <span className="text-active">~/projects/nativepi</span> ${" "}
          <span
            className={cursorBlink ? "animate-pulse" : undefined}
            style={{ display: "inline-block", width: "0.6em", height: "1.1em", verticalAlign: "text-bottom", background: "currentColor" }}
          />
        </p>
      </div>
    </div>
  );
}
