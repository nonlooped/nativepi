import type { SkillInfo } from "../../shared/pi-types.ts";
import { chipText } from "./composerText.ts";

/**
 * The composer's two insertion menus, as pure functions.
 *
 * All of the fiddly parts of an inline autocomplete — where the trigger starts,
 * what counts as still typing it, and what the text looks like afterwards — are
 * decided here so the component only has to render a list and move a highlight.
 */

export type TriggerKind = "skill" | "file";

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
 * Both open at a word boundary and close at the next space, so `@` in the middle
 * of an address and `$` in the middle of a price are left alone.
 */
export function findTrigger(text: string, caret: number): Trigger | null {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1] as string)) start--;

  const token = text.slice(start, caret);
  const kind = token.startsWith("@") ? "file" : token.startsWith("$") ? "skill" : null;
  if (!kind) return null;

  const query = token.slice(1);
  if (query.length > MAX_QUERY) return null;

  return { kind, query, start, end: caret };
}

/**
 * The text a trigger becomes once accepted.
 *
 * Both kinds turn into a chip in the editor, so this is only the plain text
 * behind it; `composerText.ts` owns what that text has to look like.
 */
export function completionText(trigger: Trigger, value: string): string {
  return chipText(trigger.kind, value);
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

export type Option = SkillOption | FileOption;

const MAX_OPTIONS = 50;

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
export function rankFiles(files: string[], query: string): FileOption[] {
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

  return scored
    .sort((a, b) => b.score - a.score || a.option.value.length - b.option.value.length || a.option.value.localeCompare(b.option.value))
    .slice(0, MAX_OPTIONS)
    .map((entry) => entry.option);
}
