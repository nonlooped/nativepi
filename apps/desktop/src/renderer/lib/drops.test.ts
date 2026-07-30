import { expect, test } from "bun:test";
import { stubFilePath } from "./store/testBridge.ts";

const { classifyDrop, mentionPath } = await import("./drops.ts");

/**
 * A drop, as Chromium presents one.
 *
 * `items` is what carries both halves of the answer: `webkitGetAsEntry` is the
 * only thing that separates a folder from an extensionless file, and the `File`
 * beside it is what the path and the mime type come from.
 */
function transfer(entries: { path: string; type?: string; directory?: boolean }[]): DataTransfer {
  const paths = new Map<object, string>();
  stubFilePath((file) => paths.get(file) ?? "");
  return {
    types: ["Files"],
    items: entries.map(({ path, type = "", directory = false }) => {
      const file = { name: path.split("\\").pop(), type } as unknown as File;
      paths.set(file, path);
      return {
        kind: "file",
        getAsFile: () => file,
        webkitGetAsEntry: () => ({ isDirectory: directory }),
      };
    }),
  } as unknown as DataTransfer;
}

test("a drop is sorted by what NativePi can do with each item", () => {
  const dropped = classifyDrop(
    transfer([
      { path: "C:\\code\\app", directory: true },
      { path: "C:\\chats\\session.jsonl" },
      { path: "C:\\shots\\bug.png", type: "image/png" },
      { path: "C:\\code\\app\\src\\index.ts" },
    ]),
  );

  expect(dropped.folders).toEqual(["C:\\code\\app"]);
  expect(dropped.sessions).toEqual(["C:\\chats\\session.jsonl"]);
  expect(dropped.images.map((image) => image.type)).toEqual(["image/png"]);
  expect(dropped.files).toEqual(["C:\\code\\app\\src\\index.ts"]);
});

test("a folder is a project even when its name looks like a session", () => {
  const dropped = classifyDrop(transfer([{ path: "C:\\code\\notes.jsonl", directory: true }]));

  expect(dropped.folders).toEqual(["C:\\code\\notes.jsonl"]);
  expect(dropped.sessions).toEqual([]);
});

test("a drop with no path behind it keeps only what a browser can supply", () => {
  stubFilePath(() => "");
  const dropped = classifyDrop({
    types: ["Files"],
    items: [
      {
        kind: "file",
        getAsFile: () => ({ name: "shot.png", type: "image/png" }) as unknown as File,
        webkitGetAsEntry: () => null,
      },
      {
        kind: "file",
        getAsFile: () => ({ name: "notes.txt", type: "text/plain" }) as unknown as File,
        webkitGetAsEntry: () => null,
      },
    ],
  } as unknown as DataTransfer);

  expect(dropped.images).toHaveLength(1);
  expect(dropped.files).toEqual([]);
});

test("a mention is relative inside the project and absolute outside it", () => {
  expect(mentionPath("C:\\code\\app", "C:\\code\\app\\src\\index.ts")).toBe("src/index.ts");
  // Windows paths compare case-insensitively, and the sidebar's copy of the
  // project path need not match the drive letter Explorer handed over.
  expect(mentionPath("C:\\code\\app", "c:\\code\\app\\src\\index.ts")).toBe("src/index.ts");
  expect(mentionPath("C:\\code\\app\\", "C:\\code\\app\\README.md")).toBe("README.md");
  expect(mentionPath("C:\\code\\app", "D:\\notes\\spec.md")).toBe("D:/notes/spec.md");
  // A sibling that merely starts with the same characters is not inside it.
  expect(mentionPath("C:\\code\\app", "C:\\code\\app2\\x.ts")).toBe("C:/code/app2/x.ts");
});
