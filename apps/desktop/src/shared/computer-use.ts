import { z } from "zod";
import { jsonValueSchema } from "./json.ts";

// Keep the CLI's operational surface, but not its separate MCP server, tracing,
// VM management, or batches (each action must remain a cancellable Pi tool call).
export const computerCommands = [
  "status", "permissions", "skills", "help", "version",
  "snapshot", "find", "get", "is", "list-surfaces",
  "click", "double-click", "triple-click", "right-click", "type", "set-value", "clear", "focus", "select", "toggle", "check", "uncheck", "expand", "collapse", "scroll", "scroll-to",
  "press", "hover", "drag", "mouse-move", "mouse-click", "mouse-wheel",
  "launch", "close-app", "list-apps", "list-windows", "list-displays", "focus-window", "resize-window", "move-window", "minimize", "maximize", "restore", "open-system-surface",
  "list-notifications", "dismiss-notification", "dismiss-all-notifications", "notification-action",
  "clipboard-get", "clipboard-set", "clipboard-clear", "wait",
] as const;
export const computerInputSchema = z.object({
  command: z.enum(computerCommands),
  args: z.array(z.string().max(16000).refine(value => !value.includes("\0"))).max(64).default([]),
  headed: z.boolean().default(false),
  input: z.string().max(100000).optional(),
});
export const computerScreenshotSchema = z.object({
  app: z.string().min(1).max(500).optional(),
  windowId: z.string().min(1).max(200).optional(),
  screen: z.number().int().min(0).max(100).optional(),
}).refine(value => value.screen === undefined || (!value.app && !value.windowId), "Choose a display or an app window.");
export const computerOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), ...computerInputSchema.shape }),
  z.object({ kind: z.literal("screenshot"), target: computerScreenshotSchema }),
]);
export type ComputerOperation = z.infer<typeof computerOperationSchema>;
export const computerRequestSchema = z.object({ type: z.literal("nativepi_computer"), requestId: z.string().min(1).max(100), operation: computerOperationSchema });
export const computerCancelSchema = z.object({ type: z.literal("nativepi_computer_cancel"), requestId: z.string().min(1).max(100) });
export const computerEnvelopeSchema = z.object({
  ok: z.boolean(), command: z.string(), version: z.string().optional(),
  data: jsonValueSchema.optional(),
  error: z.object({ code: z.string(), message: z.string(), suggestion: z.string().optional() }).catchall(jsonValueSchema).optional(),
}).catchall(jsonValueSchema);
export type ComputerEnvelope = z.infer<typeof computerEnvelopeSchema>;
export const computerResultSchema = z.object({
  envelope: computerEnvelopeSchema,
  image: z.object({ type: z.literal("image"), mimeType: z.literal("image/png"), data: z.string().max(24 * 1024 * 1024) }).optional(),
});
export type ComputerResult = z.infer<typeof computerResultSchema>;
export const computerReplySchema = z.object({ type: z.literal("nativepi_computer_reply"), requestId: z.string(), result: computerResultSchema });
export const computerStatusSchema = z.object({
  available: z.boolean(), version: z.string().optional(), platform: z.string().optional(),
  permissions: z.record(z.string(), z.object({ state: z.string() })).default({}),
  error: z.string().optional(),
});
export type ComputerStatus = z.infer<typeof computerStatusSchema>;
