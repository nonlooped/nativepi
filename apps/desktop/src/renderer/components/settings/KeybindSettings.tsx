import { useEffect, useState } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { HOVER_REVEAL, cn } from "@/lib/utils.ts";
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
 *
 * The bindings are drawn as controls rather than as bare keycaps because a
 * keycap on its own is what a reference table looks like, and this is not one.
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 rounded-xl border bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <PencilSimpleIcon className="mt-0.5 shrink-0" />
          <span>
            Every shortcut here can be changed. Click one, then press the keys you want. Escape cancels.
          </span>
        </p>
        {anyCustomized ? (
          <Button variant="outline" size="xl" onClick={resetAllKeybindings} className="shrink-0">
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Reset all
          </Button>
        ) : null}
      </div>

      {groups.map(({ group, shortcuts }) => (
        <section key={group} aria-labelledby={`shortcuts-${group}`} className="flex flex-col">
          <h2 id={`shortcuts-${group}`} className="font-heading text-sm font-semibold">
            {group}
          </h2>
          <div className="mt-3 flex flex-col">
            {shortcuts.map((shortcut) => {
              const recording = recordingId === shortcut.id;
              const hint = hintFor(shortcut.id, overrides);
              const customized = isCustomized(shortcut.id, overrides);
              const bindingDescription = recording
                ? "Recording shortcut"
                : hint
                  ? `Current shortcut: ${hint}`
                  : "Shortcut unassigned";
              return (
                <div
                  key={shortcut.id}
                  className="group flex flex-col gap-2 border-t py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium">{shortcut.label}</p>
                    <p className="text-sm leading-5 text-muted-foreground">{shortcut.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {customized ? (
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
                    <button
                      type="button"
                      onClick={() => setRecordingId(recording ? null : shortcut.id)}
                      aria-label={`Change shortcut for ${shortcut.label}. ${bindingDescription}.`}
                      className={cn(
                        "flex h-9 min-w-28 items-center justify-end gap-1 rounded-md border border-border bg-input/20 px-2 outline-none transition-colors hover:bg-input/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30",
                        recording && "border-ring bg-input/50 ring-2 ring-ring/30",
                      )}
                    >
                      {recording ? (
                        <span className="text-xs text-muted-foreground">Press a key…</span>
                      ) : (
                        <>
                          <PencilSimpleIcon
                            className={cn(HOVER_REVEAL, "mr-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100")}
                          />
                          {hint ? (
                            hint.split("+").map((key) => <Kbd key={key}>{key}</Kbd>)
                          ) : (
                            <Kbd className="text-muted-foreground">Unassigned</Kbd>
                          )}
                        </>
                      )}
                    </button>
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
