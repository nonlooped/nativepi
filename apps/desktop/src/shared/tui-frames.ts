import { z } from "zod";

/**
 * The side channel NativePi runs alongside Pi's RPC protocol.
 *
 * Pi's RPC mode answers four extension dialogs (`select`, `confirm`, `input`,
 * `editor`) and drops everything that needs a terminal: `ctx.ui.custom()` returns
 * undefined, component-factory widgets are ignored, footers and headers are
 * no-ops. Those are not missing from Pi — they are missing from the *protocol*,
 * because a pi-tui component cannot be described in JSON.
 *
 * It can, however, be *rendered* to JSON. A pi-tui `Component` renders to an
 * array of ANSI lines and consumes raw terminal input, so a component driven by a
 * real TUI over a terminal that writes to a pipe instead of a tty is exactly a
 * stream of escape sequences in one direction and keystrokes in the other. That
 * is what these frames carry, and why they are rendered into xterm on the window
 * side: the emulator, not NativePi, is what turns them back into a picture.
 *
 * Frames travel on the same stdio as Pi's own JSON lines, so every `type` is
 * prefixed: Pi's RPC mode never sees a `nativepi_` command, because the host
 * entry filters stdin before Pi reads it, and NativePi never routes one of Pi's
 * events through this module.
 *
 * Schemas rather than interfaces, because both ends of this are outside NativePi.
 * A host frame is written by the Pi process, where third-party extension code
 * decides what a widget's lines contain, and a client frame arrives from the
 * window over IPC. The schema is the single description of the shape, and the
 * TypeScript types are inferred from it so neither can drift from the other.
 */

const placementSchema = z.enum(["overlay", "aboveEditor", "belowEditor", "footer", "header"]);

/** Where a surface belongs in the window. */
export type TuiPlacement = z.infer<typeof placementSchema>;

/**
 * What the extension asked for, from `ctx.ui.custom()` or `ctx.ui.setWidget()`.
 *
 * `key` is the extension's own name for the surface — the `setWidget` key, or a
 * word for the slot when it has none. It is shown to the user, so it is a name
 * rather than an id, and it is capped because an extension chose it.
 */
const surfaceSchema = z.object({
  id: z.string().min(1).max(64),
  placement: placementSchema,
  key: z.string().max(120),
});

export type TuiSurface = z.infer<typeof surfaceSchema>;

/**
 * The `ctx.ui` calls that are data rather than components.
 *
 * A working message is a string and a spinner is a list of frames, so these cross
 * as themselves and the window renders them in its own type and colour — putting
 * an xterm pane around a five-character spinner would be the wrong trade. Every
 * field is optional: a patch carries only what the extension set, and `null` is a
 * value in three of them, meaning "restore Pi's default".
 */
const uiStateSchema = z.object({
  workingMessage: z.string().max(200).nullable().optional(),
  workingVisible: z.boolean().optional(),
  workingIndicator: z
    .object({ frames: z.array(z.string().max(80)).max(64), intervalMs: z.number().int().positive().max(10000) })
    .nullable()
    .optional(),
  hiddenThinkingLabel: z.string().max(200).nullable().optional(),
  toolsExpanded: z.boolean().optional(),
});

export type TuiUiState = z.infer<typeof uiStateSchema>;

const completionItemSchema = z.object({
  value: z.string().max(2000),
  label: z.string().max(200),
  description: z.string().max(500).optional(),
});

export type TuiCompletionItem = z.infer<typeof completionItemSchema>;

/** An extension autocomplete provider's answer, as `AutocompleteSuggestions`. */
export const tuiCompletionsSchema = z.object({
  prefix: z.string().max(200),
  items: z.array(completionItemSchema).max(200),
});

export type TuiCompletions = z.infer<typeof tuiCompletionsSchema>;

/** What accepting an extension completion does to the composer's text. */
export const tuiCompletionEditSchema = z.object({
  lines: z.array(z.string()).max(1000),
  cursorLine: z.number().int().min(0),
  cursorCol: z.number().int().min(0),
});

export type TuiCompletionEdit = z.infer<typeof tuiCompletionEditSchema>;

/** Frames the Pi host writes to the app. */
export const tuiHostFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nativepi_tui_open"), surface: surfaceSchema }),
  z.object({ type: z.literal("nativepi_tui_write"), surfaceId: z.string().min(1).max(64), data: z.string() }),
  z.object({ type: z.literal("nativepi_tui_close"), surfaceId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("nativepi_tui_state"), state: uiStateSchema }),
  z.object({ type: z.literal("nativepi_tui_paste"), text: z.string() }),
  /**
   * The trigger characters every loaded provider declared, or an empty array when
   * no extension registered one. The composer only asks the host for completions
   * once this says an extension is listening.
   */
  z.object({ type: z.literal("nativepi_tui_triggers"), characters: z.array(z.string().min(1).max(4)).max(32) }),
  z.object({
    type: z.literal("nativepi_tui_reply"),
    requestId: z.string().min(1).max(64),
    // Shape-checked where it is used, by the handler that knows what it asked for.
    data: z.unknown().optional(),
    error: z.string().max(2000).optional(),
  }),
  /**
   * Everything this project drew is gone.
   *
   * Sent by NativePi rather than by the host, when the Pi process it was talking
   * to exits: a pane whose component died with the process would otherwise keep
   * its last frame on screen and swallow every keystroke aimed at it.
   */
  z.object({ type: z.literal("nativepi_tui_reset") }),
]);

export type TuiHostFrame = z.infer<typeof tuiHostFrameSchema>;

/** Frames the app writes to the Pi host. */
export const tuiClientFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nativepi_tui_input"), surfaceId: z.string().min(1).max(64), data: z.string().max(4096) }),
  z.object({
    type: z.literal("nativepi_tui_resize"),
    surfaceId: z.string().min(1).max(64),
    cols: z.number().int().min(2).max(1000),
    rows: z.number().int().min(1).max(1000),
  }),
  /** Keeps the host's `getEditorText()` answer true without a round trip. */
  z.object({ type: z.literal("nativepi_tui_editor"), text: z.string() }),
  z.object({
    type: z.literal("nativepi_tui_complete"),
    requestId: z.string().min(1).max(64),
    lines: z.array(z.string()).max(1000),
    cursorLine: z.number().int().min(0),
    cursorCol: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("nativepi_tui_apply"),
    requestId: z.string().min(1).max(64),
    lines: z.array(z.string()).max(1000),
    cursorLine: z.number().int().min(0),
    cursorCol: z.number().int().min(0),
    item: completionItemSchema,
    prefix: z.string().max(200),
  }),
  /**
   * Draw it all again: this window has lost what the host already sent.
   *
   * Frames are folded in only for the project on screen, and a project left in
   * the background keeps a live Pi whose surfaces go on existing. Nothing about
   * them is re-sent on its own — the `open` frame happened once — so returning
   * to a project asks the host to replay its side rather than waiting for a
   * component to redraw of its own accord, which for a `custom()` dialog waiting
   * on a keystroke would be never.
   */
  z.object({ type: z.literal("nativepi_tui_sync") }),
  /**
   * Ask the host for the active session's provider list.
   *
   * `ModelRuntime.getProviders()` only reflects extension-registered providers
   * (e.g. a custom `activate()` calling `context.registerProvider()`) inside the
   * Pi process that ran the extension. The main process keeps its own
   * standalone `ModelRuntime` for login/logout orchestration outside any
   * project, which never sees those registrations, so provider-bearing
   * extensions need this round trip to reach the picker and Settings.
   */
  z.object({ type: z.literal("nativepi_tui_get_providers"), requestId: z.string().min(1).max(64) }),
]);

export type TuiClientFrame = z.infer<typeof tuiClientFrameSchema>;

/**
 * Whether a line on the shared stdio is addressed to this channel at all.
 *
 * Deliberately a prefix test and not a parse, in both directions. Routing has to
 * be decided before validity: a frame this build does not recognise, or one that
 * arrives malformed, must still be kept away from Pi's command parser and out of
 * the window's event reducer — dropped, rather than handled as something else.
 */
export function isTuiFrameType(type: unknown): boolean {
  return typeof type === "string" && type.startsWith("nativepi_tui_");
}
