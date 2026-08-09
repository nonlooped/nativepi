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

    const compiled = (await loadGraphicalExtensions(root)).find((extension) => extension.name === "@acme/counter");
    expect(compiled?.error).toBeUndefined();
    expect(compiled?.code).toContain("__NATIVEPI_HOST__");
    // Zod is the large dependency this subpath exists to share with the host.
    expect(compiled?.code).not.toContain("ZodError");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
