import KeybindSettings from "./KeybindSettings.tsx";
import TerminalSettings from "./TerminalSettings.tsx";

/** The tools around a turn: the terminal and the shortcuts that operate the workspace. */
export default function WorkbenchSettings() {
  return (
    <div className="flex flex-col gap-12">
      <TerminalSettings />
      <KeybindSettings />
    </div>
  );
}
