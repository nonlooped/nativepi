import { z } from "zod";
export const resourceChangeSchema = z.object({
  projectDir: z.string().min(1).max(32767),
  kind: z.enum(["skill", "prompt"]), scope: z.enum(["user", "project"]),
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  content: z.string().min(1).max(100000),
});
export type ResourceChange = z.infer<typeof resourceChangeSchema>;
export interface SetupResource { kind: "skill" | "prompt"; name: string; description: string; path: string; scope: string; source: string }
export interface AgentSetup { resources: SetupResource[]; errors: string[]; projectTrusted: boolean }
export const mcpSetupSchema = z.object({
  projectDir: z.string().min(1).max(32767), action: z.enum(["add", "remove", "check"]), scope: z.enum(["user", "project"]),
  name: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
  url: z.string().url().refine(v => ["https:", "http:"].includes(new URL(v).protocol)).optional(),
  command: z.string().min(1).max(1000).optional(), args: z.array(z.string().max(1000)).max(100).optional(),
}).refine(v => v.action !== "add" || !!v.url !== !!v.command, "Choose a URL or an executable.");
export type McpSetupChange = z.infer<typeof mcpSetupSchema>;

export const mcpReportSchema = z.object({ servers: z.array(z.object({ name: z.string(), scope: z.string(), source: z.string(), override: z.string().optional(), enabled: z.boolean(), exposure: z.string(), state: z.string(), tools: z.array(z.string()) })), errors: z.array(z.string()), note: z.string().optional() });
export type McpReport = z.infer<typeof mcpReportSchema>;
