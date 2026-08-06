import { createHash } from "node:crypto";
import path from "node:path";
import { expect, test } from "bun:test";
import { migrateLegacyExtensionFiles } from "./legacyBuiltIns.ts";

const directory = "C:\\extensions";
const legacy = {
  filename: "nativepi-test.ts",
  packageSource: "npm:@nativepi/test",
  checksums: [createHash("sha256").update("NativePi shipped this").digest("hex")],
};

test("migrates an unmodified legacy extension only after its Pi package installs", async () => {
  const removed: string[] = [];
  const installed: string[] = [];
  const file = path.join(directory, legacy.filename);

  await migrateLegacyExtensionFiles(
    directory,
    async (source) => {
      await Promise.resolve();
      installed.push(source);
    },
    [legacy],
    {
      readFile: async () => "NativePi shipped this",
      unlink: async (target) => {
        expect(installed).toEqual([legacy.packageSource]);
        removed.push(target);
      },
    },
  );

  expect(removed).toEqual([file]);
});

test("keeps a locally modified legacy extension", async () => {
  const calls: string[] = [];

  await migrateLegacyExtensionFiles(
    directory,
    async (source) => {
      calls.push(source);
    },
    [legacy],
    {
      readFile: async () => "locally modified",
      unlink: async (target) => {
        calls.push(target);
      },
    },
  );

  expect(calls).toEqual([]);
});

test("keeps a legacy extension when its package cannot be installed", async () => {
  let removed = false;

  await migrateLegacyExtensionFiles(
    directory,
    async () => {
      throw new Error("offline");
    },
    [legacy],
    {
      readFile: async () => "NativePi shipped this",
      unlink: async () => {
        removed = true;
      },
    },
  );

  expect(removed).toBe(false);
});
