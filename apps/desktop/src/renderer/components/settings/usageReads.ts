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
