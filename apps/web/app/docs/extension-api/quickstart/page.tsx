import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Build your first renderer",
  description: "Create a complete NativePi counter extension with a Pi host entry, typed protocol, and graphical composer control.",
};

export default function ExtensionQuickstartPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Build your first renderer"
        lede="This package keeps a counter in the Pi process and adds a compact button to NativePi's composer row. The shared protocol types and validates every value crossing between them."
      />

      <H2 id="create-package">1. Create the package</H2>
      <div className="measure mt-4">
        <Code
          lang="shell"
          code={`mkdir nativepi-counter
cd nativepi-counter
bun init -y
bun add @nativepi/extension-api
bun add -d typescript @types/react`}
        />
      </div>

      <H2 id="manifest">2. Declare both entries</H2>
      <div className="measure mt-4">
        <Code
          lang="json"
          filename="package.json"
          code={`{
  "name": "nativepi-counter",
  "version": "1.0.0",
  "type": "module",
  "keywords": ["pi-package"],
  "dependencies": {
    "@nativepi/extension-api": "^1.0.0"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^6.0.0"
  },
  "pi": {
    "extensions": ["./src/extension.ts"]
  },
  "nativepi": {
    "renderer": "./src/renderer.tsx"
  }
}`}
        />
      </div>

      <H2 id="protocol">3. Define the protocol</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          filename="src/protocol.ts"
          code={`import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

const counterState = z.object({ count: z.number().int().nonnegative() });

export const counterProtocol = defineProtocol({
  methods: {
    state: { result: counterState },
    increment: {
      params: z.object({ by: z.number().int().positive() }),
      result: counterState,
    },
  },
  events: {
    changed: counterState,
  },
});`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          The exact method names, arguments, results, event names, and payloads
          are now available to both entries through TypeScript inference. The
          schemas also run at the process boundary.
        </p>
      </Prose>

      <H2 id="host">4. Connect the Pi entry</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          filename="src/extension.ts"
          code={`import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { counterProtocol } from "./protocol.ts";

export default function counterExtension(pi: ExtensionAPI) {
  let count = 0;

  const host = connect("nativepi-counter", counterProtocol, {
    state: () => ({ count }),
    increment: ({ by }) => {
      count += by;
      const state = { count };
      host.emit("changed", state);
      return state;
    },
  });

  pi.registerCommand("counter", {
    description: "Show the current counter",
    handler: async (_args, context) => {
      context.ui.notify(\`Count: \${count}\`, "info");
    },
  });
}`}
        />
      </div>
      <Note>
        The string passed to <code>connect</code> must exactly match the package
        name in <code>package.json</code>. In Pi&apos;s terminal UI,
        <code> host.connected</code> is false and valid event emissions are
        harmless no-ops; the <code>/counter</code> command still works.
      </Note>

      <H2 id="renderer">5. Define the renderer</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          filename="src/renderer.tsx"
          code={`import { useEffect, useState } from "react";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import { Badge, Button } from "@nativepi/extension-api/ui";
import { counterProtocol } from "./protocol.ts";

function Counter({ context }: { context: RendererContext<typeof counterProtocol> }) {
  const { call, on } = context.channel;
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void call("state")
      .then((state) => {
        if (active) setCount(state.count);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    const unsubscribe = on("changed", (state) => {
      setCount(state.count);
      setError(null);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [call, on]);

  if (error) return <span style={{ color: "var(--destructive)" }}>Counter unavailable: {error}</span>;

  return (
    <Button
      variant="ghost"
      onClick={async () => {
        try {
          const state = await call("increment", { by: 1 });
          setCount(state.count);
        } catch (reason) {
          setError(String(reason));
        }
      }}
    >
      Count <Badge variant="secondary">{count}</Badge>
    </Button>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: counterProtocol,
  composerControls: [
    {
      id: "counter",
      render: (context) => <Counter context={context} />,
    },
  ],
});`}
        />
      </div>

      <H2 id="load">6. Load the package</H2>
      <Prose>
        <p>
          Install the local directory through NativePi&apos;s package settings, or
          add it with Pi and reload packages:
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="shell" code={`pi install /absolute/path/to/nativepi-counter`} />
      </div>
      <Prose className="mt-4">
        <p>
          Open a project in NativePi. The counter appears beside the model and
          thinking controls. If the renderer fails to compile or its API version
          is incompatible, NativePi shows a package load error while the ordinary
          Pi extension continues to load.
        </p>
      </Prose>

      <H2 id="next">Next steps</H2>
      <Prose>
        <ul>
          <li><Link href="/docs/extension-api/protocols">Design a larger protocol</Link></li>
          <li><Link href="/docs/extension-api/contributions">Choose another contribution slot</Link></li>
          <li><Link href="/docs/extension-api/ui">Use shared NativePi controls</Link></li>
        </ul>
      </Prose>
    </>
  );
}
