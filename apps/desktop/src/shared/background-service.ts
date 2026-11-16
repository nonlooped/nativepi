import { z } from "zod";
// Increment when request/event semantics cease to be compatible. App versions
// deliberately do not participate: a UI update can attach to a compatible host.
export const SERVICE_PROTOCOL = 1;
export const serviceDescriptorSchema = z.object({ protocol: z.number().int(), version: z.string().min(1).max(200), pid: z.number().int().positive(), port: z.number().int().min(1).max(65535), token: z.string().min(32).max(128) });
export const serviceActionSchema = z.enum(["status", "start", "stop", "enableLogin", "disableLogin"]);
export type ServiceAction = z.infer<typeof serviceActionSchema>;
export interface ServiceStatus { running: boolean; compatible: boolean; version?: string; startAtLogin: boolean; error?: string }
export const serviceMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), token: z.string().max(128), protocol: z.number().int() }),
  z.object({ type: z.literal("request"), id: z.string().min(1).max(128), name: z.string().min(1).max(128), params: z.unknown() }),
  z.object({ type: z.literal("stop"), id: z.string().min(1).max(128) }),
]);

export const serviceReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), compatible: z.boolean() }),
  z.object({ type: z.literal("response"), id: z.string().min(1).max(128), result: z.unknown().optional(), error: z.string().optional() }),
  z.object({ type: z.literal("event"), name: z.string().min(1).max(128), payload: z.unknown() }),
]);
