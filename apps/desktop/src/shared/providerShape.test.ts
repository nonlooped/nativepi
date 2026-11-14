import { expect, test } from "bun:test";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { isJsonValue } from "./json.ts";
import { shapeProviders } from "./providerShape.ts";

test("provider replies preserve credential metadata, sort ready providers first, and omit absent optional fields", async () => {
  // Avoid the user's provider catalog and credential store. Only these Pi APIs
  // are used by the projection; their outputs are the boundary under test.
  const runtime = {
    listCredentials: async () => [{ providerId: "ready", type: "oauth" }],
    getProviders: () => [
      { id: "unreadable", name: "Alpha" },
      { id: "missing", name: "Beta", auth: { apiKey: { name: "API token", login() {} } } },
      { id: "ready", name: "Zulu", auth: { oauth: { name: "OAuth", loginLabel: "Sign in" } } },
    ],
    getProviderAuthStatus: (id: string) => id === "ready"
      ? { configured: true, source: "stored", label: "Subscription" }
      : { configured: false },
    checkAuth: async (id: string) => {
      if (id === "unreadable") throw new Error("Credential store locked");
      return id === "ready";
    },
  } as unknown as ModelRuntime;
  const providers = await shapeProviders(runtime);

  expect(providers).toEqual([
    { id: "ready", name: "Zulu", supportsApiKey: false, supportsOAuth: true, oauthLabel: "Sign in",
      configured: true, ready: true, storedType: "oauth", authSource: "stored", authLabel: "Subscription" },
    { id: "unreadable", name: "Alpha", supportsApiKey: false, supportsOAuth: false, configured: false, ready: false },
    { id: "missing", name: "Beta", supportsApiKey: true, supportsOAuth: false, apiKeyLabel: "API token", configured: false, ready: false },
  ]);
  expect(isJsonValue(providers)).toBe(true);
  expect(JSON.parse(JSON.stringify(providers))).toEqual(providers);
});
