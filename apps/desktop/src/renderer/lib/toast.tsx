import { toast } from "sonner";
import type { UpdateState } from "../../shared/rpc-schema.ts";

/**
 * The transient messages NativePi raises, named rather than assembled at each
 * call site so their timing and placement stay consistent.
 */

/** The hint pill: brief, compact, and visually distinct from a notification. */
const HINT_CLASSNAMES = {
  toast:
    "pointer-events-none flex w-auto items-center justify-center rounded-full border bg-popover px-3.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg",
  title: "whitespace-nowrap font-medium",
};

/**
 * Acknowledge a keyboard action that changed something off-screen.
 *
 * Deliberately short-lived and non-interactive: it confirms an action the user
 * just took, so it must not queue behind notifications or need dismissing.
 */
export function showHint(text: string): void {
  toast(text, {
    id: "nativepi-hint", // One at a time: rapid cycling replaces, never stacks.
    duration: 1800,
    position: "top-center",
    classNames: HINT_CLASSNAMES,
  });
}

/**
 * Name the files the composer would not take.
 *
 * Silence would read as "it worked": the strip below the composer would simply
 * be missing an image the user watched themselves drop onto it.
 */
export function showAttachmentsRejected(names: string[]): void {
  toast.warning(`Could not attach ${names.join(", ")}`, { closeButton: true, duration: 8000 });
}

/**
 * Say why a drop did nothing.
 *
 * A window that silently ignores a drop is indistinguishable from one that is
 * broken, and the user has already watched the file land where they aimed it.
 */
export function showDropRejected(message: string): void {
  toast.warning(message, { closeButton: true, duration: 6000 });
}

/**
 * Surface a message from a Pi extension.
 *
 * An error stays until dismissed — it reports something that did not happen, and
 * a message that vanishes on its own is one the user can miss entirely.
 */
export function showExtensionNotification(message: string, kind: "info" | "warning" | "error" = "info"): void {
  const options = { closeButton: true } as const;
  if (kind === "error") toast.error(message, { ...options, duration: Infinity });
  else if (kind === "warning") toast.warning(message, { ...options, duration: 10_000 });
  else toast(message, { ...options, duration: 6000 });
}

const UPDATE_TOAST = "nativepi-update";
const UPDATE_CLASSNAMES = {
  toast: "w-[min(22rem,calc(100vw-2rem))]!",
};

function DownloadProgress({ percent }: { percent: number }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full origin-left rounded-full bg-info transition-transform duration-300 motion-reduce:transition-none"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      <span className="w-8 text-right font-medium tabular-nums text-popover-foreground">{percent}%</span>
    </div>
  );
}

/**
 * Offer the new version, and follow it through.
 *
 * One toast that changes rather than one per stage: the release, its download
 * and the restart that finishes it are the same piece of news, and a stack of
 * three would tell it three times. None of them time out — an update is not an
 * announcement to catch or miss — and closing one is the user declining, which
 * Settings › About leaves them a way back from.
 */
export function showUpdateNotice(
  state: UpdateState,
  previousStatus: UpdateState["status"],
  actions: { download: () => void; install: () => void },
): void {
  const name = state.version ? `NativePi ${state.version}` : "A new NativePi";
  const options = {
    id: UPDATE_TOAST,
    duration: Infinity,
    closeButton: true,
    classNames: UPDATE_CLASSNAMES,
  } as const;

  switch (state.status) {
    case "available":
      return void toast(`${name} is available`, {
        ...options,
        description: "Download the latest release when you're ready.",
        action: { label: "Update", onClick: actions.download },
      });
    case "downloading": {
      const percent = Math.min(100, Math.max(0, Math.round(state.percent ?? 0)));
      // No close button: dismissing it would leave the download running with
      // nothing on screen saying so. Clear `action` explicitly — sonner merges
      // same-id updates, so the available-state Update button would otherwise stick.
      return void toast.loading(`Downloading ${name}`, {
        ...options,
        closeButton: false,
        action: undefined,
        description: <DownloadProgress percent={percent} />,
      });
    }
    case "ready":
      return void toast.success(`${name} is ready to install`, {
        ...options,
        description: "Restart NativePi to finish the update.",
        action: { label: "Restart", onClick: actions.install },
      });
    case "error":
      // A background check that could not reach GitHub is not news. A download
      // the user asked for and did not get is.
      if (previousStatus !== "downloading") return void toast.dismiss(UPDATE_TOAST);
      return void toast.error(state.error ?? `${name} could not be downloaded.`, options);
    default:
      return void toast.dismiss(UPDATE_TOAST);
  }
}
