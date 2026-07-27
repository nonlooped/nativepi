import { expect, test } from "bun:test";
import { absoluteProjectPath } from "./paths.ts";

test("absolute project paths are not joined to the project twice", () => {
  expect(absoluteProjectPath("C:\\repo", "C:\\repo\\src\\file.ts")).toBe("C:\\repo\\src\\file.ts");
});

test("relative project paths become normalized Windows paths", () => {
  expect(absoluteProjectPath("C:\\repo\\", "src/file.ts")).toBe("C:\\repo\\src\\file.ts");
});
