import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadGraphicalExtensions } from "./extensions.ts";

test("graphical renderers compile against host-provided API, schema, and React modules", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nativepi-graphical-extension-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      name: "@acme/counter",
      nativepi: { renderer: "./renderer.tsx" },
    }));
    await writeFile(path.join(root, "renderer.tsx"), `
      import { defineProtocol, defineRenderer } from "@nativepi/extension-api";
      import { z } from "@nativepi/extension-api/schema";
      import { Button, ConversationTranscript } from "@nativepi/extension-api/ui";
      const protocol = defineProtocol({
        methods: { state: { result: z.object({ count: z.number().int() }) } },
        events: {},
      });
      export default defineRenderer({
        apiVersion: 1,
        protocol,
        composerControls: [{ id: "counter", render: () => <Button>Count</Button> }],
        conversationViews: [{
          id: "history",
          label: "History",
          render: () => <ConversationTranscript messages={[]} />,
        }],
      });
    `);

    const compiled = (await loadGraphicalExtensions(root, true)).find((extension) => extension.name === "@acme/counter");
    expect(compiled?.error).toBeUndefined();
    expect(compiled?.code).toContain("__NATIVEPI_HOST__");
    // Zod is the large dependency this subpath exists to share with the host.
    expect(compiled?.code).not.toContain("ZodError");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an untrusted project cannot load its graphical renderer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nativepi-untrusted-renderer-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      name: "@acme/untrusted",
      nativepi: { renderer: "./renderer.js" },
    }));
    await writeFile(path.join(root, "renderer.js"), "globalThis.untrustedCodeRan = true; export default {};");

    expect((await loadGraphicalExtensions(root, false)).find((extension) => extension.id === root)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a change in an imported renderer module invalidates the bundle cache", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nativepi-renderer-import-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      name: "@acme/imported",
      nativepi: { renderer: "./renderer.js" },
    }));
    await writeFile(path.join(root, "value.js"), "export const value = 'before';");
    await writeFile(path.join(root, "renderer.js"), "import { value } from './value.js'; export default { value };");

    const before = (await loadGraphicalExtensions(root, true))[0]?.code;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(path.join(root, "value.js"), "export const value = 'after';");
    const after = (await loadGraphicalExtensions(root, true))[0]?.code;

    expect(before).toContain("before");
    expect(after).toContain("after");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
