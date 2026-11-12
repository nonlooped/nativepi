import { subscriptionUsagesSchema } from "../../../../../../packages/subscription-usage/types.ts";
import type { SubscriptionUsage, SubscriptionUsageLimit } from "../../../../../../packages/subscription-usage/types.ts";
import type { UsageDashboard } from "../../../shared/pi-types.ts";
import type { HostRequests } from "../../../shared/rpc-schema.ts";
import { createRequestCache } from "../../lib/requestCache.ts";
import { rpc } from "../../lib/rpc.ts";

type UsageProjects = HostRequests["getUsageDashboard"]["params"]["projects"];
export const usageProjectsKey = (projects: UsageProjects) => JSON.stringify(projects.map(({ path, name }) => [path, name]));

export function createUsageDashboardReader() {
  const cache = createRequestCache<string, UsageDashboard>();
  return {
    load: (projects: UsageProjects) => cache.load(usageProjectsKey(projects), async () => {
      const { dashboard, error } = await rpc.request.getUsageDashboard({ projects });
      if (error || !dashboard) throw new Error(error ?? "Pi returned no usage dashboard.");
      return dashboard;
    }),
    invalidate: (projects: UsageProjects) => cache.invalidate(usageProjectsKey(projects)),
  };
}

export type { SubscriptionUsage, SubscriptionUsageLimit };
type SubscriptionUsageSnapshot = { usages: SubscriptionUsage[]; observedAt: number };

// Keep this reader with the mounted panel. Returning from Providers or Extensions
// then reads the new auth/runtime, rather than reusing a prior visit's limits.
export function createSubscriptionUsageReader() {
  const cache = createRequestCache<string, SubscriptionUsageSnapshot>();
  const key = (projectDir: string | null, sessionFile: string | null) => JSON.stringify([projectDir, sessionFile]);
  return {
    load: (projectDir: string | null, sessionFile: string | null) => cache.load(key(projectDir, sessionFile), async () => {
      if (!projectDir) return { usages: [], observedAt: Date.now() };
      const { result, error } = await rpc.request.callExtension({
        projectDir, sessionFile,
        extension: "@nativepi/subscription-usage", method: "usages",
      });
      if (error) throw new Error(error);
      const parsed = subscriptionUsagesSchema.safeParse(result);
      if (!parsed.success) throw new Error("The subscription provider returned invalid usage data.");
      const usages = parsed.data.usages.map((usage) => ({
        ...usage,
        limits: usage.limits.toSorted((a, b) => b.usedPercent - a.usedPercent),
      }));
      usages.sort((a, b) => (b.limits[0]?.usedPercent ?? 0) - (a.limits[0]?.usedPercent ?? 0));
      return { usages, observedAt: Date.now() };
    }),
    invalidate: (projectDir: string | null, sessionFile: string | null) => cache.invalidate(key(projectDir, sessionFile)),
  };
}
