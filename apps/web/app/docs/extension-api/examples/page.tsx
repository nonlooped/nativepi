import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Extension examples and recipes",
  description: "Copy focused NativePi extension patterns for live host state, failed calls, tool lifecycle UI, settings, and desktop actions.",
};

export default function ExtensionExamplesPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Examples and recipes"
        lede="Small patterns for the parts every graphical renderer needs: loading host state, staying current, handling failures, and keeping durable behavior in Pi."
      />

      <H2 id="live-state">Load and subscribe to live state</H2>
      <Prose>
        <p>
          Fetch an initial snapshot, subscribe to later events, and ignore a
          response that arrives after unmount. Depend on the stable channel
          functions rather than the changing context object.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`function TaskCount({ context }: { context: RendererContext<typeof taskProtocol> }) {
  const { call, on } = context.channel;
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void call("state")
      .then((state) => {
        if (active) setCount(state.tasks.length);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });

    const unsubscribe = on("changed", (state) => {
      setCount(state.tasks.length);
      setError(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [call, on]);

  if (error) return <span style={{ color: "var(--destructive)" }}>{error}</span>;
  return <Badge variant="secondary">{count ?? "…"}</Badge>;
}`}
        />
      </div>

      <H2 id="failed-call">Handle a failed method call</H2>
      <Prose>
        <p>
          Method calls can fail validation, throw in the Pi process, time out, or
          lose their active chat. Handle the promise in the interaction that
          created it.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<Button
  onClick={async () => {
    try {
      const next = await context.channel.call("increment", { by: 1 });
      setCount(next.count);
    } catch (error) {
      context.actions.notify(\`Unable to increment: \${String(error)}\`, "error");
    }
  }}
>
  Increment
</Button>`}
        />
      </div>

      <H2 id="tool-lifecycle">Render every tool state</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`tools: {
  "deploy.run": ({ call, result }) => {
    const target = String(call.arguments.target ?? "unknown target");

    if (!result) return <DeployStatus target={target} status="running" />;
    if (result.isError) {
      return <DeployStatus target={target} status="failed" detail={result.text} />;
    }

    return <DeployStatus target={target} status="complete" detail={result.text} />;
  },
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Keep the target visible in all three states so the row remains stable
          while the result arrives. Do not present a failed result with the same
          treatment as a successful one.
        </p>
      </Prose>

      <H2 id="host-backed-setting">Update a host-backed setting</H2>
      <Prose>
        <p>
          Optimistically changing only React state creates a NativePi-only
          setting. Commit through the host and render the validated result it
          returns.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<SettingsSwitchRow
  label="Confirm destructive queries"
  checked={settings.confirmDestructive}
  onChange={(checked) => {
    void context.channel
      .call("updateSettings", { confirmDestructive: checked })
      .then(setSettings)
      .catch((error) => context.actions.notify(String(error), "error"));
  }}
/>`}
        />
      </div>

      <H2 id="desktop-actions">Open a project file</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`async function openFinding(context: RendererContext, finding: Finding) {
  try {
    await context.actions.openFile(finding.file, {
      line: finding.line,
      column: finding.column,
    });
  } catch (error) {
    context.actions.notify(\`Unable to open \${finding.file}: \${String(error)}\`, "error");
  }
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Pass a project-relative path. Use <code>openExternal</code> only for
          HTTP or HTTPS URLs and <code>revealFile</code> when the file manager is
          more appropriate than an editor.
        </p>
      </Prose>

      <H2 id="terminal-fallback">Keep a terminal path</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`pi.registerCommand("tasks", {
  description: "Show project tasks",
  handler: async (_args, context) => {
    if (!host.connected) {
      context.ui.notify(tasks.map((task) => task.title).join("\n") || "No tasks", "info");
      return;
    }

    context.ui.notify(\`\${tasks.length} tasks shown in NativePi\`, "info");
  },
});`}
        />
      </div>

      <Note>
        A graphical renderer is optional presentation. Keep tools, commands,
        state, and terminal interaction in the ordinary Pi entry so the package
        remains useful without NativePi.
      </Note>

      <H2 id="complete-example">Complete example</H2>
      <Prose>
        <p>
          The <Link href="/docs/extension-api/quickstart">counter quickstart</Link>{" "}
          shows the manifest, shared protocol, Pi entry, renderer, and local
          installation together.
        </p>
      </Prose>
    </>
  );
}
