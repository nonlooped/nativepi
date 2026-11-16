import { z } from "zod";
export const quotaWindowSchema = z.object({ label: z.string(), usedPercent: z.number().finite().min(0).max(100), resetAt: z.string().datetime().optional() });
export const capacitySchema = z.object({ provider: z.string(), name: z.string(), status: z.enum(["ready", "error", "unsupported"]), plan: z.string().optional(), details: z.array(z.string()).optional(), windows: z.array(quotaWindowSchema), fetchedAt: z.string().optional(), stale: z.boolean(), message: z.string().optional() });
export type SubscriptionCapacity = z.infer<typeof capacitySchema>;
