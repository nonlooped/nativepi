import type { CommandInfo, SkillInfo } from "../../shared/pi-types.ts";
import { chipText } from "./composerText.ts";

/**
 * The composer's insertion menus, as pure functions.
 *
 * All of the fiddly parts of an inline autocomplete — where the trigger starts,
 * what counts as still typing it, and what the text looks like afterwards — are
 * decided here so the component only has to render a list and move a highlight.
 */

export type TriggerKind = "command" | "skill" | "file" | "extension";

export interface Trigger {
  kind: TriggerKind;
  /** What the user has typed after the trigger character. */
  query: string;
  /** Index of the trigger character itself. */
  start: number;
  /** Index just past the query, always the caret. */
  end: number;
}

/**
 * A query long enough to be prose is prose. Past this the user is writing a
 * sentence that happens to start with a sigil, not picking from a list.
 */
const MAX_QUERY = 64;

/** Characters that begin a new word inside a name or a path. */
const BOUNDARY = new Set(["/", "\\", "-", "_", ".", " "]);

/**
 * The trigger the caret is currently inside, if any.
 *
 * `@` and `$` open at a word boundary and close at the next space, so `@` in the
 * middle of an address and `$` in the middle of a price are left alone. `/` only
 * opens at the very start of the message, because that is the only place Pi
 * reads a command — offering one mid-sentence would promise an expansion that
 * never happens.
 *
 * `extensionTriggers` are the characters a loaded extension declared through
 * `ctx.ui.addAutocompleteProvider()`, such as `#` for issue numbers. They are
 * checked last, so an extension cannot take `@`, `$` or `/` away from the menus
 * the composer already documents.
 */
export function findTrigger(text: string, caret: number, extensionTriggers: readonly string[] = []): Trigger | null {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1] as string)) start--;

  const token = text.slice(start, caret);
  // Longest first: an extension may declare both `#` and `##`, and the longer one
  // is the more specific claim on the token.
  const extension = [...extensionTriggers]
    .sort((a, b) => b.length - a.length)
    .find((character) => token.startsWith(character));
  const kind = token.startsWith("@")
    ? "file"
    : token.startsWith("$")
      ? "skill"
      : start === 0 && token.startsWith("/")
        ? "command"
        : extension
          ? "extension"
          : null;
  if (!kind) return null;

  // A trigger is one character for the composer's own menus, but an extension
  // declares whatever string it wants, so the query starts where its trigger ends.
  const query = token.slice(kind === "extension" ? (extension as string).length : 1);
  if (query.length > MAX_QUERY) return null;

  return { kind, query, start, end: caret };
}

/**
 * The text a trigger becomes once accepted.
 *
 * `@` and `$` turn into a chip in the editor, so this is only the plain text
 * behind it; `composerText.ts` owns what that text has to look like. A command
 * is written literally, because the user goes on to type arguments after it.
 *
 * An extension trigger has no form of its own here: the provider that offered the
 * suggestion decides what accepting it does, and the value it returns is used as
 * written. See `applyExtensionCompletion` in `ComposerInput`.
 */
export function completionText(trigger: Trigger, value: string): string {
  if (trigger.kind === "command") return `/${value}`;
  if (trigger.kind === "extension") return value;
  return chipText(trigger.kind, value);
}

/**
 * The draft as an extension's provider expects it: lines, and the caret as a row
 * and column.
 *
 * pi-tui's editor is multi-line and providers are written against that shape, so
 * a draft with a paragraph in it has to arrive the way it would from the terminal
 * editor rather than as one long string with an offset.
 */
export function linesAt(text: string, caret: number): { lines: string[]; cursorLine: number; cursorCol: number } {
  const lines = text.split("\n");
  let remaining = caret;
  for (const [index, line] of lines.entries()) {
    if (remaining <= line.length) return { lines, cursorLine: index, cursorCol: remaining };
    remaining -= line.length + 1;
  }
  return { lines, cursorLine: Math.max(0, lines.length - 1), cursorCol: (lines[lines.length - 1] ?? "").length };
}

/** The offset in the whole draft of a row and column, for putting the caret back. */
export function offsetAt(lines: string[], cursorLine: number, cursorCol: number): number {
  const before = lines.slice(0, cursorLine).reduce((total, line) => total + line.length + 1, 0);
  return before + Math.min(cursorCol, (lines[cursorLine] ?? "").length);
}

export interface Match {
  score: number;
  /** Indices in the candidate that the query matched, for highlighting. */
  positions: number[];
}

/**
 * Score `candidate` against a subsequence `query`, or `null` if it does not match.
 *
 * Leftmost-greedy rather than optimal: for names and paths the first place a
 * character can land is nearly always the one a reader would point at, and the
 * bonuses below are what separate `store.ts` from `restore-tsconfig.ts` for the
 * query `store`.
 */
export function fuzzyMatch(candidate: string, query: string): Match | null {
  if (query === "") return { score: 0, positions: [] };

  const haystack = candidate.toLowerCase();
  const needle = query.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  let streak = 0;

  for (const ch of needle) {
    const at = haystack.indexOf(ch, from);
    if (at === -1) return null;

    streak = at === from && positions.length > 0 ? streak + 1 : 0;
    score += 1 + streak * 4;
    if (at === 0) score += 10;
    else if (BOUNDARY.has(haystack[at - 1] as string)) score += 8;
    if (candidate[at] === query[positions.length]) score += 1;
    // Every skipped character costs, so an early dense match beats a late loose
    // one, but the cost is capped or a long path could never outrank a short.
    score -= Math.min(at - from, 8);

    positions.push(at);
    from = at + 1;
  }

  return { score, positions };
}

export interface CommandOption {
  kind: "command";
  value: string;
  label: string;
  detail: string;
  source: CommandInfo["source"];
  positions: number[];
}

export interface SkillOption {
  kind: "skill";
  value: string;
  label: string;
  detail: string;
  scope: SkillInfo["scope"];
  positions: number[];
}

export interface FileOption {
  kind: "file";
  value: string;
  /** The basename, which is what the eye looks for first. */
  label: string;
  /** The directory it sits in, or "" at the root. */
  detail: string;
  positions: number[];
}

/**
 * A completion an extension's own provider offered.
 *
 * Not ranked or filtered here: the provider was given the whole line and the
 * caret and answered with the list it wants shown, in its order. Re-scoring it
 * locally would mean two opinions about the same query, and the extension's is
 * the one that knows what the characters mean. `prefix` is the text the provider
 * says it is replacing, and it goes back to the provider when one is accepted.
 */
export interface ExtensionCompletionOption {
  kind: "extension";
  value: string;
  label: string;
  detail: string;
  prefix: string;
  positions: number[];
}

export type Option = CommandOption | SkillOption | FileOption | ExtensionCompletionOption;

const MAX_OPTIONS = 50;

/**
 * Rank the commands Pi reported, most relevant first.
 *
 * Ties break towards the shorter name rather than alphabetically: `/test`
 * matching the query `test` is what was meant, not `/test-integration`.
 */
export function rankCommands(commands: CommandInfo[], query: string): CommandOption[] {
  return commands
    .flatMap((command) => {
      const match = fuzzyMatch(command.name, query);
      if (!match) return [];
      return [
        {
          option: {
            kind: "command" as const,
            value: command.name,
            label: command.name,
            detail: command.description ?? "",
            source: command.source,
            positions: match.positions,
          },
          score: match.score,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.option.value.length - b.option.value.length || a.option.value.localeCompare(b.option.value),
    )
    .slice(0, MAX_OPTIONS)
    .map((entry) => entry.option);
}

export function rankSkills(skills: SkillInfo[], query: string): SkillOption[] {
  return skills
    .flatMap((skill) => {
      const match = fuzzyMatch(skill.name, query);
      if (!match) return [];
      return [
        {
          option: {
            kind: "skill" as const,
            value: skill.name,
            label: skill.name,
            detail: skill.description,
            scope: skill.scope,
            positions: match.positions,
          },
          score: match.score,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || a.option.value.localeCompare(b.option.value))
    .slice(0, MAX_OPTIONS)
    .map((entry) => entry.option);
}

/**
 * Rank files, trying the name before the whole path.
 *
 * The name is tried first and worth more, because typing `store` means the file
 * called store, not every file underneath a `store/`. Only when the name alone
 * cannot account for the query does the full path get its turn — which is what
 * makes `lib/st` find `src/lib/store.ts` — and the row then highlights across
 * the directories, so it shows why it matched.
 */
const fileRankCache = new Map<string, FileOption[]>();
export function rankFiles(files: string[], query: string): FileOption[] {
  // Query cache — files array is stable per project (only refreshes on demand) and query
  // changes per keystroke. Hit rate is high when backspacing.
  const cacheKey = `${files.length}:${query}`;
  const cached = fileRankCache.get(cacheKey);
  if (cached) return cached;
  const scored: { option: FileOption; score: number }[] = [];

  for (const file of files) {
    const baseStart = file.lastIndexOf("/") + 1;
    const base = file.slice(baseStart);
    const byName = fuzzyMatch(base, query);
    const match = byName
      ? { score: byName.score + 12, positions: byName.positions.map((position) => position + baseStart) }
      : fuzzyMatch(file, query);
    if (!match) continue;
    // Shallow paths win ties: the file at the top of a project is more often the
    // one meant than its namesake six directories down.
    const depth = file.split("/").length - 1;
    scored.push({
      option: {
        kind: "file",
        value: file,
        label: base,
        detail: baseStart === 0 ? "" : file.slice(0, baseStart - 1),
        positions: match.positions,
      },
      score: match.score - depth,
    });
  }

  const result = scored
    .sort((a, b) => b.score - a.score || a.option.value.length - b.option.value.length || a.option.value.localeCompare(b.option.value))
    .slice(0, MAX_OPTIONS)
    .map((entry) => entry.option);
  if (fileRankCache.size > 200) fileRankCache.clear();
  fileRankCache.set(cacheKey, result);
  return result;
}
