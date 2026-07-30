import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AuthProviderInfo } from "./rpc-schema.ts";

/**
 * Shape a `ModelRuntime`'s providers into what the renderer expects.
 *
 * Shared because two processes build this list from two different runtimes:
 * the main process's standalone one (login/logout outside any project) and,
 * per session, the Pi host's — the only one that has run extension `activate()`
 * and therefore the only one that knows about `context.registerProvider()`.
 */
export async function shapeProviders(runtime: ModelRuntime): Promise<AuthProviderInfo[]> {
  const stored = await runtime.listCredentials();
  const storedType = new Map(stored.map((c) => [c.providerId, c.type]));

  const providers = runtime.getProviders().map((p): AuthProviderInfo => {
    const status = runtime.getProviderAuthStatus(p.id);
    return {
      id: p.id,
      name: p.name,
      supportsApiKey: !!p.auth?.apiKey?.login,
      supportsOAuth: !!p.auth?.oauth,
      apiKeyLabel: p.auth?.apiKey?.name,
      oauthLabel: p.auth?.oauth?.loginLabel ?? p.auth?.oauth?.name,
      configured: status.configured,
      storedType: storedType.get(p.id),
      authSource: status.source,
      authLabel: status.label,
    };
  });

  providers.sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  return providers;
}
