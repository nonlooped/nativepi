import { expect, test } from "bun:test";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { isJsonValue } from "./json.ts";
import { shapeProviders } from "./providerShape.ts";

test("shapes providers as valid JSON for the Pi host side channel", async () => {
  const runtime = await ModelRuntime.create({ allowModelNetwork: false });
  const providers = await shapeProviders(runtime);

  expect(providers.length).toBeGreaterThan(0);
  expect(isJsonValue(providers)).toBe(true);
});
