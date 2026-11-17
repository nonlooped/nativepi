import { useState } from "react";
import { Input } from "../ui/input.tsx";
import SettingsDetails from "./SettingsDetails.tsx";
import { useAppStore } from "../../lib/store.ts";
import { TERMINAL_FONT } from "../../lib/terminalFont.ts";
import PiPanel from "./PiPanel.tsx";
import { ActionRow, SelectRow, SettingsSection, SliderRow, SwitchRow, TextRow } from "./rows.tsx";

/** Presentation for the integrated terminal; Pi’s command shell is a separate section. */
export default function TerminalSettings() {
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        heading="Integrated terminal"
        description="Changes apply to open terminals without losing scrollback."
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
        <SwitchRow
          label="Blink the cursor"
          checked={preferences.terminalCursorBlink}
          onChange={(value) => setPreference("terminalCursorBlink", value)}
        />
        <TerminalPreview
          fontSize={preferences.terminalFontSize}
          cursorBlink={preferences.terminalCursorBlink}
          scrollback={preferences.terminalScrollback}
        />
      </SettingsSection>

      <SettingsDetails id="scrollback" title="Scrollback" summary={`${preferences.terminalScrollback.toLocaleString()} lines kept per terminal`}>
        <ScrollbackControl />
      </SettingsDetails>
    </div>
  );
}

export function PiShellSettings() {
  const update = useAppStore(s => s.updatePiSetting);
  return (
    <PiPanel>
        {(settings) => (
          <SettingsSection
            heading="Pi’s shell"
            description="Used by Pi’s command tool, independently of the integrated terminal."
          >
            <TextRow
              label="Shell"
              description="Path to the shell executable. Leave empty to let Pi choose."
              value={settings.shellPath}
              placeholder="Chosen by Pi"
              onCommit={(value) => void update("shellPath", value)}
            />
            <TextRow
              label="Command prefix"
              description="Added before every command Pi runs."
              value={settings.shellCommandPrefix}
              placeholder="None"
              onCommit={(value) => void update("shellCommandPrefix", value)}
            />
          </SettingsSection>
        )}
    </PiPanel>
  );
}

function ScrollbackControl() {
  const value = useAppStore(s => s.preferences.terminalScrollback);
  const setPreference = useAppStore(s => s.setPreference);
  const [custom, setCustom] = useState(false);
  const presets = [1000, 5000, 10000, 50000, 100000];
  return <>
    <SelectRow label="Lines of output" value={custom || !presets.includes(value) ? "custom" : String(value)}
      options={[...presets.map(count => ({ value: String(count), label: count.toLocaleString() })), { value: "custom", label: "Custom" }]}
      onChange={next => { setCustom(next === "custom"); if (next !== "custom") setPreference("terminalScrollback", Number(next)); }} />
    {custom || !presets.includes(value) ? <ActionRow label="Custom line count" description="Between 500 and 100,000 lines.">
      <Input aria-label="Custom line count" type="number" min={500} max={100000} step={500} key={value} defaultValue={value} className="h-8 w-36"
        onBlur={event => { const next = Number(event.currentTarget.value); if (Number.isInteger(next) && next >= 500 && next <= 100000) setPreference("terminalScrollback", next); else event.currentTarget.value = String(value); }}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </ActionRow> : null}
  </>;
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
    <div aria-hidden="true" className="my-2 overflow-hidden rounded-md border border-border/40 bg-sidebar/40">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-1.5">
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
