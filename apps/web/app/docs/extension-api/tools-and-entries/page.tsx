import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Tool and entry renderers",
  description: "Render Pi tool calls, results, failures, and session entries inside the NativePi transcript.",
};

export default function ToolsAndEntriesPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Tool and entry renderers"
        lede="Transcript renderers replace the default presentation for one tool name or session-entry type. They present Pi data; they do not execute tools or write entries themselves."
      />

      <H2 id="tool-renderers">Tool renderers</H2>
      <Prose>
        <p>
          Add a renderer under the exact tool name registered with Pi. It
          receives the call immediately and an optional result once execution
          has produced one.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          filename="src/renderer.tsx"
          code={`export default defineRenderer({
  apiVersion: 1,
  tools: {
    "db.query": ({ call, result }) => {
      const sql = String(call.arguments.sql ?? "");

      if (!result) return <QueryProgress sql={sql} />;
      if (result.isError) return <QueryError sql={sql} message={result.text} />;

      return <QueryResult sql={sql} rows={result.details} />;
    },
  },
});`}
        />
      </div>

      <H2 id="tool-lifecycle">Render the full lifecycle</H2>
      <Prose>
        <ul>
          <li>
            <strong>Running:</strong> <code>result</code> is undefined. Keep the
            call identity and arguments visible while work is in flight.
          </li>
          <li>
            <strong>Success:</strong> show the useful structured result, with raw
            text available when it helps explain the outcome.
          </li>
          <li>
            <strong>Failure:</strong> <code>result.isError</code> is true. Make
            failure at least as clear as NativePi&apos;s default tool container.
          </li>
        </ul>
        <p>
          Calls may restore from a session long after the package version that
          created them. Treat arguments and details defensively unless you have
          narrowed their generic types and preserve compatibility intentionally.
        </p>
      </Prose>

      <H2 id="tool-types">Tool types</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface ToolCall<Arguments extends Record<string, unknown>> {
  id: string;
  name: string;
  arguments: Arguments;
}

interface ToolResult<Details> {
  toolName: string;
  text: string;
  details?: Details;
  isError: boolean;
}`}
        />
      </div>

      <H2 id="entry-renderers">Entry renderers</H2>
      <Prose>
        <p>
          Entry renderers are keyed by the top-level <code>entry.type</code> value
          stored in the Pi session. They receive the complete entry object and
          current renderer context.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`export default defineRenderer({
  apiVersion: 1,
  entries: {
    compaction: ({ entry }) => (
      <CompactionSummary summary={String(entry.summary ?? "Session compacted")} />
    ),
  },
});`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Pi entries created with <code>pi.appendEntry(customType, data)</code>{" "}
          have top-level type <code>custom</code> and carry their extension key in
          <code>entry.customType</code>. A renderer registered under{" "}
          <code>custom</code> must inspect that field and return a fallback for
          entries it does not recognize.
        </p>
      </Prose>

      <Note>
        Only the first configured renderer for a tool name or top-level entry
        type is used. Do not claim a broad entry type such as <code>custom</code>{" "}
        unless the package can safely present entries it did not create.
      </Note>

      <H2 id="related">Related reference</H2>
      <Prose>
        <ul>
          <li><Link href="/docs/extension-api/reference#toolrenderer">ToolRenderer</Link></li>
          <li><Link href="/docs/extension-api/reference#entryrenderer">EntryRenderer</Link></li>
          <li><Link href="/docs/extension-api/renderer-context">Renderer context</Link></li>
        </ul>
      </Prose>
    </>
  );
}
