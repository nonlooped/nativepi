import { useEffect, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { stripAnsi } from "../lib/ansi.ts";
import { useReducedMotion } from "../lib/motion.ts";
import { formatElapsed, pluralize } from "../lib/format.ts";
import { withHint } from "../lib/shortcuts.ts";
import { Button } from "./ui/button.tsx";
import { cn } from "../lib/utils.ts";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "./ui/dropdown-menu.tsx";

/**
 * The current frame of an extension's working indicator, or `null` for ours.
 *
 * Frames arrive as the extension styled them, which for a terminal means ANSI
 * colour around the glyph. The escape codes are stripped rather than translated:
 * this pill has one foreground colour in the window's palette, and a spinner in
 * an extension's idea of "accent" would be the one element on screen ignoring the
 * theme. Reduced motion holds the first frame instead of cycling.
 */
function useIndicatorFrame(
  indicator: { frames: string[]; intervalMs: number } | null,
  reduced: boolean,
): string | null {
  const [index, setIndex] = useState(0);
  const frames = indicator?.frames;
  const interval = indicator?.intervalMs ?? 120;

  useEffect(() => {
    if (!frames || frames.length < 2 || reduced) return;
    const timer = window.setInterval(() => setIndex((current) => current + 1), Math.max(30, interval));
    return () => window.clearInterval(timer);
  }, [frames, interval, reduced]);

  if (!frames) return null;
  if (frames.length === 0) return "";
  return stripAnsi(frames[index % frames.length] ?? "");
}

export function RunStatusBar({
  activeTool,
  compacting,
  filesChanged,
}: {
  activeTool?: string;
  compacting: boolean;
  filesChanged: number;
}) {
  const abort = useAppStore((s) => s.abort);
  const runStartedAt = useAppStore((s) => activeConversation(s).runStartedAt);
  const ui = useAppStore((s) => s.extUiState);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const behavior = useAppStore((s) => s.sendBehavior);
  const setBehavior = useAppStore((s) => s.setSendBehavior);
  const elapsed = useElapsed(runStartedAt);
  const reduced = useReducedMotion();
  const frame = useIndicatorFrame(ui.workingIndicator, reduced);

  // `ctx.ui.setWorkingVisible(false)` hides the loader row: an extension that
  // reports progress its own way should not have to compete with this pill. What
  // it does not hide is Stop, which is the app's, not Pi's: this is the only way
  // to cancel a turn with a pointer, and an extension turning off a progress
  // indicator is not asking for that to go with it.
  const progress = ui.workingVisible;

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-[calc(100%-2rem)] min-w-0 items-center rounded-full border bg-popover py-1 pr-1 text-xs text-popover-foreground shadow-lg",
        progress ? "gap-2 pl-3" : "pl-1",
      )}
    >
      {progress ? (
        <>
          {frame === null ? (
            reduced ? (
              <CircleIcon weight="fill" className="shrink-0 text-muted-foreground" />
            ) : (
              <CircleNotchIcon className="shrink-0 animate-spin text-muted-foreground" />
            )
          ) : frame === "" ? null : (
            <span aria-hidden="true" className="shrink-0 font-mono text-muted-foreground">
              {frame}
            </span>
          )}
          <span className="truncate font-medium">
            {compacting
              ? "Summarizing earlier messages"
              : (ui.workingMessage ?? (activeTool ? `Running ${activeTool}` : "Working"))}
          </span>
          {elapsed ? (
            <span className="shrink-0 tabular-nums text-muted-foreground" aria-hidden="true">
              {elapsed}
            </span>
          ) : null}
          {filesChanged > 0 ? (
            <>
              <span aria-hidden="true" className="hidden text-muted-foreground/50 min-[380px]:inline">
                ·
              </span>
              <span className="hidden shrink-0 truncate text-muted-foreground min-[380px]:inline">{pluralize(filesChanged, "file")} changed</span>
            </>
          ) : null}
        </>
      ) : null}
      <BehaviorSelector behavior={behavior} setBehavior={setBehavior} />
      {/* A labelled rectangle, not another circle: geometry, not hue, is what
          separates it from Send. */}
      <Button
        variant="destructive"
        size="sm"
        onClick={abort}
        title={withHint("Stop this turn", "stopTurn", keybindingOverrides)}
        className="ml-1 h-6 shrink-0 rounded-full px-2.5"
      >
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop
      </Button>
    </div>
  );
}

/**
 * The pill's settling moment: the same shape as the run pill, holding the
 * turn's duration and file count for a beat before the transcript goes quiet.
 * A stopped run says so — "Done" would misreport an abort as a completion.
 */
export function RunDoneBar({ elapsed, files, stopped }: { elapsed: string; files: number; stopped: boolean }) {
  return (
    <div className="pointer-events-auto flex max-w-[calc(100%-2rem)] min-w-0 items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg">
      {stopped ? (
        <StopIcon weight="fill" className="shrink-0 text-muted-foreground" />
      ) : (
        <CheckIcon weight="bold" className="shrink-0 text-success" />
      )}
      <span className="truncate font-medium">
        {stopped ? (elapsed ? `Stopped after ${elapsed}` : "Stopped") : elapsed ? `Done in ${elapsed}` : "Done"}
      </span>
      {files > 0 ? (
        <>
          <span aria-hidden="true" className="hidden text-muted-foreground/50 min-[380px]:inline">
            ·
          </span>
          <span className="hidden shrink-0 truncate text-muted-foreground min-[380px]:inline">{pluralize(files, "file")} changed</span>
        </>
      ) : null}
    </div>
  );
}

function BehaviorSelector({
  behavior,
  setBehavior,
}: {
  behavior: "steer" | "followUp";
  setBehavior: (behavior: "steer" | "followUp") => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Message behaviour: ${behavior === "steer" ? "steer this turn" : "queue a follow-up"}`}
        className="flex h-6 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{behavior === "steer" ? "Steer" : "Follow up"}</span>
        <CaretDownIcon className="size-3 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="w-64 p-1.5">
        <MenuGroup>
          <MenuItem onClick={() => setBehavior("steer")} className="items-start gap-2 rounded-md">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Steer</span>
              <span className="text-xs text-muted-foreground">Redirect the current turn now</span>
            </div>
            {behavior === "steer" ? <CheckIcon className="ml-auto mt-0.5 shrink-0" /> : null}
          </MenuItem>
          <MenuItem onClick={() => setBehavior("followUp")} className="items-start gap-2 rounded-md">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Follow up</span>
              <span className="text-xs text-muted-foreground">Run after the current turn settles</span>
            </div>
            {behavior === "followUp" ? <CheckIcon className="ml-auto mt-0.5 shrink-0" /> : null}
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

export function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (startedAt === null) return "";
  return formatElapsed(Math.max(0, now - startedAt));
}

/**
 * A polite live region carrying coarse turn phases. Screen readers otherwise get
 * silence for the whole duration of an agent turn, since the streaming markdown
 * itself is deliberately not announced.
 */
export function TurnAnnouncer({
  running,
  aborted,
  compacting,
  retry,
  activeTool,
}: {
  running: boolean;
  aborted: boolean;
  compacting: boolean;
  retry: { attempt: number; maxAttempts: number } | null;
  activeTool?: string;
}) {
  const phase = retry
    ? `Retrying after an error, attempt ${retry.attempt} of ${retry.maxAttempts}`
    : compacting
      ? "Summarizing earlier messages"
      : running
        ? activeTool
          ? `Running ${activeTool}`
          : "Working"
        : "";

  const [message, setMessage] = useState("");
  const wasBusy = useRef(false);

  useEffect(() => {
    if (phase) {
      wasBusy.current = true;
      setMessage(phase);
      return;
    }
    if (wasBusy.current) {
      wasBusy.current = false;
      setMessage(aborted ? "Response stopped" : "Response complete");
    }
  }, [phase, aborted]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
