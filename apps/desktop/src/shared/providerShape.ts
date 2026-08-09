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

  const providers = await Promise.all(
    runtime.getProviders().map(async (p) => {
      const status = runtime.getProviderAuthStatus(p.id);
      const apiKeyLabel = p.auth?.apiKey?.name;
      const oauthLabel = p.auth?.oauth?.loginLabel ?? p.auth?.oauth?.name;
      const credentialType = storedType.get(p.id);
      return {
        id: p.id,
        name: p.name,
        supportsApiKey: !!p.auth?.apiKey?.login,
        supportsOAuth: !!p.auth?.oauth,
        ...(apiKeyLabel === undefined ? {} : { apiKeyLabel }),
        ...(oauthLabel === undefined ? {} : { oauthLabel }),
        configured: status.configured,
        // The same question Pi's own model list asks, so a provider offered here
        // and a provider offered in the picker are the same set. A credential
        // store that cannot be read is an unusable provider, not a crash.
        ready: await runtime.checkAuth(p.id).then(Boolean, () => false),
        ...(credentialType === undefined ? {} : { storedType: credentialType }),
        ...(status.source === undefined ? {} : { authSource: status.source }),
        ...(status.label === undefined ? {} : { authLabel: status.label }),
      } satisfies AuthProviderInfo;
    }),
  );

  providers.sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
  return providers;
}
