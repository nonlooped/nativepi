import { expect, test } from "bun:test";
import { DEFAULT_INTERFACE_SCALE, stepInterfaceScale } from "./interface-scale.ts";
import { preferencesSchema } from "./rpc-schema.ts";

test("new and invalid scale preferences use 110%, saved choices remain intact", () => {
  expect(preferencesSchema.parse({}).interfaceScale).toBe(DEFAULT_INTERFACE_SCALE);
  expect(preferencesSchema.parse({ interfaceScale: "bad" }).interfaceScale).toBe(1.1);
  expect(preferencesSchema.parse({ interfaceScale: 1 }).interfaceScale).toBe(1);
});

test("scale shortcuts step without floating point drift and stop at both limits", () => {
  let scale = DEFAULT_INTERFACE_SCALE;
  for (let i = 0; i < 20; i++) scale = stepInterfaceScale(scale, 1);
  expect(scale).toBe(1.4);
  expect(stepInterfaceScale(1.1, 1)).toBe(1.15);
  expect(stepInterfaceScale(1.15, -1)).toBe(1.1);
  for (let i = 0; i < 20; i++) scale = stepInterfaceScale(scale, -1);
  expect(scale).toBe(0.9);
});
