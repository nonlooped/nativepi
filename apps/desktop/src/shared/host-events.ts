import { z } from "zod";
import { authNoticeSchema, authPromptSchema, tuiHostFrameSchema } from "./tui-frames.ts";
import type { HostEventName } from "./rpc-schema.ts";
const target = z.looseObject({ projectDir: z.string(), sessionFile: z.string().optional(), runtimeId: z.string().optional() });
const terminal = target.extend({ terminalId: z.string() });
export const hostEventSchemas = {
  piStatus: target.extend({ status: z.enum(["idle", "starting", "ready", "error", "exited"]), detail: z.string().optional() }),
  piEvent: target.extend({ sequence: z.number().int().nonnegative().optional(), runtimeId: z.string().optional(), event: z.looseObject({ type: z.string() }) }),
  piError: target.extend({ message: z.string() }),
  sessionChangedExternally: target.extend({ sessionFile: z.string() }),
  sessionsChanged: target,
  projectFilesChanged: target.extend({ path: z.string() }),
  authPrompt: z.looseObject({ flowId: z.string().optional(), runtimeId: z.string().optional(), projectDir: z.string().optional(), sessionFile: z.string().optional(), id: z.string(), prompt: authPromptSchema }),
  authNotice: z.looseObject({ flowId: z.string().optional(), runtimeId: z.string().optional(), sessionFile: z.string().optional(), projectDir: z.string().optional(), notice: authNoticeSchema }),
  windowFullScreen: z.object({ fullscreen: z.boolean() }),
  windowMaximized: z.object({ maximized: z.boolean() }),
  updateState: z.looseObject({ status: z.enum(["unsupported", "manual", "idle", "checking", "available", "downloading", "ready", "error"]), channel: z.enum(["stable", "nightly"]) }),
  quitRequested: z.object({ work: z.object({ runs: z.array(z.string()), terminals: z.array(z.string()), viewers: z.number().int().nonnegative() }) }),
  terminalData: terminal.extend({ data: z.string(), sequence: z.number().int().nonnegative() }),
  terminalExit: terminal.extend({ exitCode: z.number() }),
  terminalRestart: target.extend({ terminal: z.looseObject({ id: z.string(), projectDir: z.string(), name: z.string(), shellId: z.string(), exited: z.boolean(), exitCode: z.number().optional() }) }),
  tuiFrame: target.extend({ frame: tuiHostFrameSchema }),
} satisfies Record<HostEventName, z.ZodType>;
export const hostEventKeys = Object.fromEntries(Object.keys(hostEventSchemas).map(key => [key, true])) as Record<HostEventName, true>;
export function validHostEvent(name: string, payload: unknown): boolean {
  return Object.hasOwn(hostEventSchemas, name) && hostEventSchemas[name as HostEventName].safeParse(payload).success;
}
