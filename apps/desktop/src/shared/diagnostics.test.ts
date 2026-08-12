import { expect, test } from "bun:test";
import { redactDiagnosticsText } from "./diagnostics.ts";

const paths = {
  home: "C:\\Users\\Alice",
  userData: "C:\\Users\\Alice\\AppData\\Roaming\\NativePi",
  privatePaths: ["D:\\work\\secret-project"],
};

test("diagnostics redact credentials and private paths without hiding useful structure", () => {
  const report = redactDiagnosticsText(`
project=D:\\work\\secret-project\\src
home=C:\\Users\\Alice\\.pi
other=C:\\Users\\Bob\\repo
Authorization: Bearer top-secret-token
apiKey="sk-1234567890abcdefgh"
url=https://alice:password@example.com/repo?token=secret&ok=1
model=openai/gpt-5
`, paths);

  expect(report).toContain("project=<path>\\src");
  expect(report).toContain("home=<home>\\.pi");
  expect(report).toContain("other=C:\\Users\\<user>\\repo");
  expect(report).toContain("model=openai/gpt-5");
  expect(report).not.toContain("Alice");
  expect(report).not.toContain("Bob");
  expect(report).not.toContain("top-secret-token");
  expect(report).not.toContain("sk-1234567890abcdefgh");
  expect(report).not.toContain("alice:password");
  expect(report).not.toContain("token=secret");
});
