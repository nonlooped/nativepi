import { expect, test } from "bun:test";
import { browserAction } from "./browser.ts";
test("browser URL boundary permits local servers and rejects native schemes, credentials and unbounded actions", () => {
  expect(
    browserAction.parse({ action: "open", url: "http://localhost:3000" })
      .action,
  ).toBe("open");
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://name:secret@example.com",
    "nativepi://host",
  ])
    expect(browserAction.safeParse({ action: "open", url }).success).toBe(
      false,
    );
  expect(
    browserAction.safeParse({
      action: "type",
      tab: crypto.randomUUID(),
      ref: "a",
      text: "x".repeat(16001),
    }).success,
  ).toBe(false);
  expect(
    browserAction.safeParse({ action: "evaluate", script: "process.exit()" })
      .success,
  ).toBe(false);
});
