import { z } from "zod";

export const subscriptionUsageProviderIds = [
  "anthropic",
  "github-copilot",
  "kimi-coding",
  "openai-codex",
] as const;

export const subscriptionUsageProviderSchema = z.enum(subscriptionUsageProviderIds);
export type SubscriptionUsageProvider = z.infer<typeof subscriptionUsageProviderSchema>;

export const subscriptionUsageSchema = z.object({
  provider: subscriptionUsageProviderSchema,
  limits: z.array(
    z.object({
      label: z.string().min(1).max(80),
      usedPercent: z.number().finite().min(0).max(100),
      resetAt: z.string().max(80).optional(),
    }),
  ).max(16),
});

export type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;

export function supportsSubscriptionUsage(provider?: string): provider is SubscriptionUsageProvider {
  return subscriptionUsageProviderIds.some((id) => id === provider);
}
