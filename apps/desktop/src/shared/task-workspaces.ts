import { z } from "zod";
export const workspaceRecipeSchema = z.object({ setup: z.string().max(8000).default(""), run: z.string().max(8000).default(""), check: z.string().max(8000).default("") });
export const workspaceRecordSchema = z.object({ path: z.string(), repository: z.string(), branch: z.string(), base: z.string(), owner: z.enum(["chat", "delegate", "automation"]), status: z.enum(["created", "running", "ready", "failed", "interrupted"]), action: z.enum(["setup", "run", "check"]).optional(), port: z.number().int().optional(), output: z.string().default(""), error: z.string().optional() });
export type WorkspaceRecipe = z.infer<typeof workspaceRecipeSchema>;
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;
export type WorkspaceListing = { currentPath?: string; supported?: boolean; recipe: WorkspaceRecipe; worktrees: { path: string; branch: string; main: boolean; managed?: WorkspaceRecord }[] };
export const workspaceActionSchema = z.object({ projectDir: z.string().min(1), action: z.enum(["setup", "run", "check", "stop", "inspect", "remove"]), confirmed: z.boolean().optional(), copyFiles: z.array(z.string().min(1).max(1000)).max(32).optional() });
