import { browserAnnotationTargetSchema } from "./browserAnnotation.ts";
import { preferencesSchema } from "./rpc-schema.ts";
import { z } from "zod";
// Increment when request/event semantics cease to be compatible. App versions
// deliberately do not participate: a UI update can attach to a compatible host.
export const SERVICE_PROTOCOL = 2;
export const serviceDescriptorSchema = z.object({ protocol: z.number().int(), version: z.string().min(1).max(200), pid: z.number().int().positive(), port: z.number().int().min(1).max(65535), token: z.string().min(32).max(128) });
export const serviceActionSchema = z.enum(["status", "start", "stop", "enableLogin", "disableLogin"]);
export type ServiceAction = z.infer<typeof serviceActionSchema>;
export interface ServiceStatus { running: boolean; compatible: boolean; version?: string; startAtLogin: boolean; error?: string }
export const browserRelaySchema = z.object({
  type: z.literal("browser"), id: z.string().uuid(), browser: z.string().uuid(),
  method: z.enum(["show", "setOwner", "run", "chrome", "cancel", "dispose"]),
  annotationTarget: browserAnnotationTargetSchema.optional(),
  ownerTitle: z.string().max(200).optional(),
  input: z.unknown().optional(), preferences: preferencesSchema.optional(),
});
export const browserRelayReplySchema = z.object({ type: z.literal("browserReply"), id: z.string().uuid(), result: z.unknown().optional(), error: z.string().max(4000).optional() });
export const serviceMessageSchema = z.discriminatedUnion("type", [
  browserRelayReplySchema,
  z.object({ type: z.literal("browserAttach"), id: z.string().min(1).max(128) }),
  z.object({ type: z.literal("auth"), token: z.string().max(128), protocol: z.number().int() }),
  z.object({ type: z.literal("request"), id: z.string().min(1).max(128), name: z.string().min(1).max(128), params: z.unknown() }),
  z.object({ type: z.literal("stop"), id: z.string().min(1).max(128) }),
]);

export const serviceReplySchema = z.discriminatedUnion("type", [
  browserRelaySchema,
  z.object({ type: z.literal("ready"), compatible: z.boolean() }),
  z.object({ type: z.literal("response"), id: z.string().min(1).max(128), result: z.unknown().optional(), error: z.string().optional() }),
  z.object({ type: z.literal("event"), name: z.string().min(1).max(128), payload: z.unknown() }),
]);
