import { expect, test } from "bun:test";
import { findTerminalLinks } from "./terminalLinks.ts";

test("links a path with a line and column", () => {
  const [match] = findTerminalLinks("  at src/main.ts:42:5");

  expect(match).toEqual({ start: 5, end: 21, kind: "file", file: "src/main.ts", line: 42, column: 5 });
});

test("links a bare code filename without a path separator", () => {
  const [match] = findTerminalLinks("error in App.tsx:10");

  expect(match?.kind).toBe("file");
});

test("does not link an ordinary host:port that is not a file", () => {
  expect(findTerminalLinks("connecting to example.com:8080")).toEqual([]);
});

test("links a localhost URL and does not also link its port as a file", () => {
  const matches = findTerminalLinks("Server running at http://localhost:3000/app");

  expect(matches).toEqual([
    { start: 18, end: 43, kind: "url", url: "http://localhost:3000/app" },
  ]);
});

test("links 127.0.0.1 the same as localhost", () => {
  const [match] = findTerminalLinks("http://127.0.0.1:8080");

  expect(match).toEqual({ start: 0, end: 21, kind: "url", url: "http://127.0.0.1:8080" });
});

test("ignores a non-localhost URL", () => {
  expect(findTerminalLinks("https://example.com")).toEqual([]);
});
