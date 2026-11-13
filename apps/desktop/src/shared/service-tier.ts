import { z } from "zod";
export const serviceTierSchema = z.enum(["default", "priority"]);
export type ServiceTier = z.infer<typeof serviceTierSchema>;
export const serviceTierStateSchema = z.object({
  tier: z.preprocess(value => ["auto", "flex", "standard_only", "standard"].includes(String(value)) ? "default" : value, serviceTierSchema),
  tiers: z.array(serviceTierSchema),
});
export type ServiceTierState = z.infer<typeof serviceTierStateSchema>;
export const serviceTierLabels: Record<ServiceTier, string> = {
  default: "Standard", priority: "Priority",
};
export const serviceTierDescriptions: Record<ServiceTier, string> = {
  default: "Normal pricing and response speed",
  priority: "Faster responses; higher cost or subscription usage",
};
export function serviceTierTarget(project: string | null, session: string | null, model?: { provider: string; id: string }): string {
  return JSON.stringify([project, session, model?.provider, model?.id]);
}
