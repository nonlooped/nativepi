import { expect, test } from "bun:test";
import { formatCommandLine, parseCommandLine } from "./commandLine.ts";

test("preserves Windows paths and shell-looking text in npm commands", () => {
  expect(parseCommandLine("npm --prefix C:\\repo\\app $NPM_PREFIX")).toEqual([
    "npm",
    "--prefix",
    "C:\\repo\\app",
    "$NPM_PREFIX",
  ]);
});

test("round-trips npm command arguments containing spaces and quotes", () => {
  const command = ["npm", "--prefix", "C:\\repo folder\\app", "--tag=it\"s-ready"];
  expect(parseCommandLine(formatCommandLine(command))).toEqual(command);
});
