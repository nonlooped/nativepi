import { expect, test } from "bun:test";
import { providerIconName } from "./providerIcons.ts";

test("new Pi provider IDs resolve to their bundled brand marks", () => {
  for (const [provider, icon] of Object.entries({ baseten: "baseten", meta: "meta", typesafe: "typesafeai", "qwen-token-plan-individual-cn": "qwen" })) {
    expect(providerIconName(provider)).toBe(icon);
  }
  expect(providerIconName("custom-extension-provider")).toBe("custom-extension-provider");
});
