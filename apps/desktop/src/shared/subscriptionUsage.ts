import { z } from "zod";

/** Data returned by the NativePi subscription-usage extension. */
export const subscriptionUsageSchema = z.object({
  provider: z.string().min(1).max(80),
  limits: z.array(
    z.object({
      label: z.string().min(1).max(80),
      usedPercent: z.number().finite().min(0).max(100),
      resetAt: z.string().max(80).optional(),
      windowSeconds: z.number().finite().positive().max(31_536_000).optional(),
    }),
  ).max(16),
});

export type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;

/** The extra bit needed to hide the generic UI for providers the extension does not support. */
export const subscriptionUsageResponseSchema = z.object({
  supported: z.boolean(),
  usage: subscriptionUsageSchema.optional(),
});

export type SubscriptionUsageResponse = z.infer<typeof subscriptionUsageResponseSchema>;
