import { expect, test } from "bun:test";
import { isLocalPackageSource } from "./packages.ts";

test("package sources distinguish local paths from installed packages", () => {
  expect(isLocalPackageSource("C:\\projects\\pi-extension")).toBe(true);
  expect(isLocalPackageSource("/home/dev/pi-extension")).toBe(true);
  expect(isLocalPackageSource("../packages/pi-extension")).toBe(true);
  expect(isLocalPackageSource(".\\packages\\pi-extension")).toBe(true);

  expect(isLocalPackageSource("npm:pi-claude-bridge")).toBe(false);
  expect(isLocalPackageSource("ask-user")).toBe(false);
  expect(isLocalPackageSource("git:github.com/acme/pi-extension")).toBe(false);
  expect(isLocalPackageSource("https://github.com/acme/pi-extension")).toBe(false);
});
