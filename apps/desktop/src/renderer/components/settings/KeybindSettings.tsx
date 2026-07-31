import { useEffect, useState } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { cn } from "@/lib/utils.ts";
import { useAppStore } from "../../lib/store.ts";
import {
  defaultBindingFor,
  hintFor,
  isCustomized,
  parseKeyEvent,
  shortcutsByGroup,
  type ShortcutId,
} from "../../lib/shortcuts.ts";

/**
 * The shortcut reference, editable in place.
 *
 * Clicking a binding starts a one-key recorder rather than a text field: the
 * combo a person means is the one they can press, and a text field would make
 * them spell out key names tinykeys itself does not show them anywhere else.
 */
export default function KeybindSettings() {
  const overrides = useAppStore((s) => s.keybindingOverrides);
  const setKeybinding = useAppStore((s) => s.setKeybinding);
  const resetKeybinding = useAppStore((s) => s.resetKeybinding);
  const resetAllKeybindings = useAppStore((s) => s.resetAllKeybindings);
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);

  // Captured at the window so the recorder wins over every other shortcut
  // listener while it is open, including the one it is about to replace.
  useEffect(() => {
    if (!recordingId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingId(null);
        return;
      }
      const binding = parseKeyEvent(event);
      if (!binding) return; // A bare modifier: keep waiting for the real key.
      setKeybinding(recordingId, binding);
      setRecordingId(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingId, setKeybinding]);

  const groups = shortcutsByGroup();
  const anyCustomized = groups.some(({ shortcuts }) => shortcuts.some((s) => isCustomized(s.id, overrides)));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Click a shortcut, then press the new keys. Escape cancels.</p>
        {anyCustomized ? (
          <Button variant="ghost" size="sm" onClick={resetAllKeybindings} className="shrink-0">
            Reset all to defaults
          </Button>
        ) : null}
      </div>
      {groups.map(({ group, shortcuts }) => (
        <section key={group} aria-labelledby={`shortcuts-${group}`} className="flex flex-col">
          <h2 id={`shortcuts-${group}`} className="font-heading text-sm font-semibold">
            {group}
          </h2>
          <div className="mt-4 flex flex-col">
            {shortcuts.map((shortcut) => {
              const recording = recordingId === shortcut.id;
              const hint = hintFor(shortcut.id, overrides);
              const bindingDescription = recording
                ? "Recording shortcut"
                : hint
                  ? `Current shortcut: ${hint}`
                  : "Shortcut unassigned";
              return (
                <div
                  key={shortcut.id}
                  className="flex flex-col gap-2 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm font-medium">{shortcut.label}</p>
                    <p className="text-sm leading-5 text-muted-foreground">{shortcut.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRecordingId(recording ? null : shortcut.id)}
                      aria-label={`Change shortcut for ${shortcut.label}. ${bindingDescription}.`}
                      className={cn(
                        "flex min-h-6 items-center gap-1 rounded-md border border-transparent px-1 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                        recording && "border-ring ring-2 ring-ring/30",
                      )}
                    >
                      {recording ? (
                        <Kbd className="text-muted-foreground">Press a key…</Kbd>
                      ) : hint ? (
                        hint.split("+").map((key) => <Kbd key={key}>{key}</Kbd>)
                      ) : (
                        <Kbd className="text-muted-foreground">Unassigned</Kbd>
                      )}
                    </button>
                    {isCustomized(shortcut.id, overrides) ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Reset ${shortcut.label} to default`}
                        title={defaultBindingFor(shortcut.id) ? `Reset to ${hintFor(shortcut.id)}` : "Reset to default"}
                        onClick={() => resetKeybinding(shortcut.id)}
                      >
                        <ArrowCounterClockwiseIcon />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
