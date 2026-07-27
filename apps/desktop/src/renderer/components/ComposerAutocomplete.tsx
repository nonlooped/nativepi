import { FileTextIcon } from "@phosphor-icons/react/FileText";
import { LightningIcon } from "@phosphor-icons/react/Lightning";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { SkillInfo } from "../../shared/pi-types.ts";
import {
  findTrigger,
  rankFiles,
  rankSkills,
  type Option,
  type Trigger,
  type TriggerKind,
} from "../lib/autocomplete.ts";
import { rpc } from "../lib/rpc.ts";
import { Kbd } from "@/components/ui/kbd.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * `$` for skills and `@` for files, inline in the composer.
 *
 * The menu is a listbox the textarea drives: focus never leaves the message the
 * user is writing, so the arrow keys and Enter are borrowed while it is open and
 * handed straight back when it closes. See `lib/autocomplete.ts` for where a
 * trigger begins and what accepting one does to the text.
 */

/** A repository the agent is editing goes stale fast; a menu of deleted files is worse than a slow one. */
const REFRESH_AFTER_MS = 5000;

/** Long enough to scroll, short enough that the composer stays the thing you are looking at. */
const MAX_VISIBLE = 8;

export interface ComposerAutocomplete {
  open: boolean;
  options: Option[];
  active: number;
  kind: TriggerKind;
  loading: boolean;
  /** Call from `onKeyDown`; `true` means the menu consumed the key. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => boolean;
  /** Call whenever the text or the caret may have moved. */
  sync: (text: string, caret: number | null) => void;
  accept: (index: number) => void;
  setActive: (index: number) => void;
  close: () => void;
}

export function useComposerAutocomplete(
  projectPath: string | null,
  onAccept: (trigger: Trigger, option: Option) => void,
): ComposerAutocomplete {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  // Escape closes the menu for the trigger being typed, not for the character
  // class: retyping `@` somewhere else is a fresh request for the list.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const { skills, files, loading } = useCompletionData(projectPath, trigger?.kind ?? null);

  const open = trigger !== null && dismissed !== trigger.start;
  const options = !open
    ? EMPTY
    : trigger.kind === "skill"
      ? rankSkills(skills, trigger.query)
      : rankFiles(files, trigger.query);

  const sync = useCallback((text: string, caret: number | null) => {
    const next = caret === null ? null : findTrigger(text, caret);
    setTrigger((current) => (sameTrigger(current, next) ? current : next));
    setDismissed((current) => (next && current === next.start ? current : null));
    setActive(0);
  }, []);

  const close = useCallback(() => setDismissed(trigger?.start ?? null), [trigger]);

  const accept = useCallback(
    (index: number) => {
      const option = options[index];
      if (!trigger || !option) return;
      onAccept(trigger, option);
      setTrigger(null);
    },
    [options, trigger, onAccept],
  );

  const shown = open && (options.length > 0 || loading);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!shown) return false;
      const count = options.length;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (count) setActive((index) => (index + 1) % count);
          return true;
        case "ArrowUp":
          event.preventDefault();
          if (count) setActive((index) => (index - 1 + count) % count);
          return true;
        case "Enter":
        case "Tab":
          if (event.nativeEvent.isComposing || count === 0) return false;
          event.preventDefault();
          accept(active);
          return true;
        case "Escape":
          event.preventDefault();
          close();
          return true;
        default:
          return false;
      }
    },
    [shown, options.length, active, accept, close],
  );

  return {
    open: shown,
    options,
    active: Math.min(active, Math.max(0, options.length - 1)),
    kind: trigger?.kind ?? "file",
    loading,
    onKeyDown,
    sync,
    accept,
    setActive,
    close,
  };
}

const EMPTY: Option[] = [];

function sameTrigger(a: Trigger | null, b: Trigger | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.start === b.start && a.query === b.query;
}

/**
 * The lists behind the two menus, read when one opens rather than on a timer.
 *
 * Nothing here belongs in the store: it is derived from the project on disk, it
 * is only ever read, and keeping a copy that outlives the open menu would just
 * be a cache to invalidate.
 */
function useCompletionData(projectPath: string | null, kind: TriggerKind | null) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const read = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!kind || !projectPath) return;
    const key = `${kind}:${projectPath}`;
    const last = read.current;
    if (last?.key === key && Date.now() - last.at < REFRESH_AFTER_MS) return;
    read.current = { key, at: Date.now() };

    let cancelled = false;
    setLoading(true);
    const request =
      kind === "skill"
        ? rpc.request.listSkills({ projectDir: projectPath }).then((result) => {
            if (!cancelled) setSkills(result.skills);
          })
        : rpc.request.listProjectFiles({ projectDir: projectPath }).then((result) => {
            if (!cancelled) setFiles(result.files);
          });

    void request.catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, projectPath]);

  return { skills, files, loading };
}

export function AutocompleteMenu({ state }: { state: ComposerAutocomplete }) {
  if (!state.open) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl",
        "duration-150 animate-in fade-in-0 slide-in-from-bottom-1",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {state.kind === "skill" ? "Skills" : "Files in this project"}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span>to move</span>
          <Kbd>Enter</Kbd>
          <span>to insert</span>
        </p>
      </div>
      {state.options.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-muted-foreground">
          {state.loading ? "Looking…" : state.kind === "skill" ? "No matching skill." : "No matching file."}
        </p>
      ) : (
        <ul
          role="listbox"
          id="composer-autocomplete"
          aria-label={state.kind === "skill" ? "Skills" : "Files"}
          className="max-h-72 overflow-y-auto p-1.5"
          style={{ maxHeight: `${MAX_VISIBLE * 2.5 + 0.75}rem` }}
        >
          {state.options.map((option, index) => (
            <Row
              key={option.value}
              option={option}
              activeRow={index === state.active}
              onPick={() => state.accept(index)}
              onHover={() => state.setActive(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  option,
  activeRow,
  onPick,
  onHover,
}: {
  option: Option;
  activeRow: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  // Follows the highlight rather than the pointer, so arrowing past the eighth
  // row scrolls instead of walking the selection off the bottom of the menu.
  useLayoutEffect(() => {
    if (activeRow) ref.current?.scrollIntoView({ block: "nearest" });
  }, [activeRow]);

  const Icon = option.kind === "skill" ? LightningIcon : FileTextIcon;
  const nameOffset = option.value.length - option.label.length;

  return (
    <li
      ref={ref}
      id={`composer-autocomplete-${option.value}`}
      role="option"
      aria-selected={activeRow}
      onMouseDown={(event) => {
        // The textarea must keep focus: losing it would close the menu before
        // the click resolves, and drop the caret the insertion depends on.
        event.preventDefault();
        onPick();
      }}
      onMouseMove={onHover}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm",
        activeRow ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", activeRow ? "text-foreground" : "text-muted-foreground")} weight="fill" />
      <span className="min-w-0 shrink-0 max-w-[55%] truncate font-medium">
        <Highlighted text={option.label} positions={option.positions} offset={nameOffset} />
      </span>
      {option.detail ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {option.kind === "file" ? (
            <Highlighted text={option.detail} positions={option.positions} offset={0} />
          ) : (
            option.detail
          )}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      {option.kind === "skill" && option.scope === "project" ? (
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">project</span>
      ) : null}
    </li>
  );
}

/**
 * The matched characters, marked.
 *
 * Weight rather than colour: the row already uses colour for its selected state,
 * and a second hue inside it would compete with that for the same glance.
 */
function Highlighted({ text, positions, offset }: { text: string; positions: number[]; offset: number }) {
  const hit = new Set(positions.map((position) => position - offset));
  return (
    <>
      {[...text].map((character, index) =>
        hit.has(index) ? (
          <span key={index} className="font-semibold text-primary underline decoration-primary/40 underline-offset-2">
            {character}
          </span>
        ) : (
          <span key={index}>{character}</span>
        ),
      )}
    </>
  );
}
