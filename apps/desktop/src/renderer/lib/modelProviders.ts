import type { ModelInfo } from "../../shared/pi-types.ts";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";

export function modelProviders(providers: AuthProviderInfo[], models: ModelInfo[]): AuthProviderInfo[] {
  return providers.filter((provider) => models.some((model) => model.provider === provider.id));
}
