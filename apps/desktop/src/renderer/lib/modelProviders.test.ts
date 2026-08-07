import { expect, test } from "bun:test";
import { modelProviders } from "./modelProviders.ts";

test("includes an extension provider when Pi exposes its models without Pi credentials", () => {
  const providers = modelProviders(
    [
      {
        id: "claude-bridge",
        name: "Claude Bridge",
        supportsApiKey: false,
        supportsOAuth: false,
        configured: false,
        ready: false,
      },
    ],
    [{ provider: "claude-bridge", id: "claude-sonnet-5" }],
  );

  expect(providers.map((provider) => provider.id)).toEqual(["claude-bridge"]);
});
