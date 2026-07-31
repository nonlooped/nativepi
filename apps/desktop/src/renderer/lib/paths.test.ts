import { expect, test } from "bun:test";
import { absoluteProjectPath } from "./paths.ts";

test("absolute project paths are not joined to the project twice", () => {
  expect(absoluteProjectPath("C:\\repo", "C:\\repo\\src\\file.ts")).toBe("C:\\repo\\src\\file.ts");
});

test("relative project paths become normalized Windows paths", () => {
  expect(absoluteProjectPath("C:\\repo\\", "src/file.ts")).toBe("C:\\repo\\src\\file.ts");
});

test("forward-slash UNC paths remain absolute", () => {
  expect(absoluteProjectPath("C:\\repo", "//server/share/file.ts")).toBe("\\\\server\\share\\file.ts");
});

test("absolute POSIX paths are not joined to the project twice", () => {
  expect(absoluteProjectPath("/Users/pat/repo", "/Users/pat/repo/src/file.ts")).toBe("/Users/pat/repo/src/file.ts");
});

test("relative POSIX project paths stay forward-slashed", () => {
  expect(absoluteProjectPath("/Users/pat/repo/", "src/file.ts")).toBe("/Users/pat/repo/src/file.ts");
});
