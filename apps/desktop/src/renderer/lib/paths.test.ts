import { expect, test } from "bun:test";
import { absoluteProjectPath, projectRelativePath } from "./paths.ts";

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

test("absolute Windows paths become project-relative for display", () => {
  expect(projectRelativePath("C:\\Users\\pat\\repo", "c:/Users/pat/repo/src/file.ts")).toBe("src/file.ts");
});

test("absolute POSIX paths become project-relative for display", () => {
  expect(projectRelativePath("/Users/pat/repo", "/Users/pat/repo/src/file.ts")).toBe("src/file.ts");
});

test("already-relative paths are normalized for display", () => {
  expect(projectRelativePath("C:\\repo", ".\\src\\file.ts")).toBe("src/file.ts");
});
