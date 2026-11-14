import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { thinkingLevelSchema } from "../shared/pi-values.ts";
import type { ChatTitleCatalog } from "../shared/chat-title.ts";
import { serviceTiers } from "../shared/service-tier.ts";

export function chatTitleCatalog(runtime: ModelRuntime, defaults?: { getDefaultProvider(): string | undefined; getDefaultModel(): string | undefined }): ChatTitleCatalog {
  const provider = defaults?.getDefaultProvider();
  const id = defaults?.getDefaultModel();
  return {
    defaultModel: provider && id ? `${provider}/${id}` : undefined,
    models: runtime.getAvailableSnapshot().map(model => ({
      provider: model.provider, id: model.id, name: model.name,
      thinkingLevels: getSupportedThinkingLevels(model).flatMap(level => {
        const parsed = thinkingLevelSchema.safeParse(level);
        return parsed.success ? [parsed.data] : [];
      }),
      tiers: [...serviceTiers(model)],
      cost: model.cost,
    })),
  };
}
