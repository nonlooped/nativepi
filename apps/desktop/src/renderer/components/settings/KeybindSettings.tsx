import { hintFor, shortcutsByGroup } from "../../lib/shortcuts.ts";
import { Kbd } from "@/components/ui/kbd.tsx";

/**
 * The shortcut reference.
 *
 * Read-only on purpose: NativePi's shortcuts are fixed, and a screen that looks
 * editable but is not would be worse than one that plainly is not. The list is
 * generated from the same registry `tinykeys` is bound from, so it cannot drift
 * from the keys that actually work.
 */
export default function KeybindSettings() {
  return (
    <div className="flex flex-col gap-10">
      {shortcutsByGroup().map(({ group, shortcuts }) => (
        <section key={group} aria-labelledby={`shortcuts-${group}`} className="flex flex-col">
          <h2 id={`shortcuts-${group}`} className="font-heading text-sm font-semibold">
            {group}
          </h2>
          <div className="mt-4 flex flex-col">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.id} className="flex items-center justify-between gap-8 border-t py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium">{shortcut.label}</p>
                  <p className="text-sm leading-5 text-muted-foreground">{shortcut.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {hintFor(shortcut.id)
                    .split("+")
                    .map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
