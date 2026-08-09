import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const subscriptionUsageLimitSchema = z.object({
  label: z.string(),
  usedPercent: z.number().finite(),
  resetAt: z.string().optional(),
  windowSeconds: z.number().finite().optional(),
});
export type SubscriptionUsageLimit = z.infer<typeof subscriptionUsageLimitSchema>;

export const subscriptionUsageSchema = z.object({
  provider: z.string(),
  limits: z.array(subscriptionUsageLimitSchema),
});
export type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;

export const usageReadingSchema = z.object({
  supported: z.boolean(),
  usage: subscriptionUsageSchema.optional(),
});
export type UsageReading = z.infer<typeof usageReadingSchema>;

export const subscriptionUsagesSchema = z.object({
  usages: z.array(subscriptionUsageSchema),
});
export type SubscriptionUsages = z.infer<typeof subscriptionUsagesSchema>;

export const subscriptionUsageProtocol = defineProtocol({
  methods: {
    usage: {
      params: z.object({ providerId: z.string().min(1).optional() }).optional(),
      result: usageReadingSchema,
    },
    usages: {
      result: subscriptionUsagesSchema,
    },
  },
  events: { changed: undefined },
});
