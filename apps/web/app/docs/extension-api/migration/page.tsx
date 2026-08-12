import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Migrate a 0.x renderer",
  description: "Migrate an experimental NativePi raw-channel renderer to the schema-validated extension API version 1 contract.",
};

export default function ExtensionMigrationPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension reference"
        title="Migrate from 0.x"
        lede="Version 1 replaces the experimental raw channel with one shared, schema-validated protocol and consistent renderer context names. Update both package entries together."
      />

      <H2 id="checklist">Migration checklist</H2>
      <Prose>
        <ol className="list-decimal ps-5 marker:text-dim">
          <li>Add the literal <code>apiVersion: 1</code> to <code>defineRenderer</code>.</li>
          <li>Define one protocol with <code>defineProtocol</code>.</li>
          <li>Pass that protocol to both <code>defineRenderer</code> and <code>connect</code>.</li>
          <li>Replace individual raw method registration with the complete handler table passed to <code>connect</code>.</li>
          <li>Rename <code>NativePiContext</code> to <code>RendererContext</code>.</li>
          <li>Rename renderer prop <code>ctx</code> to <code>context</code>.</li>
          <li>Move <code>ctx.call</code> and <code>ctx.on</code> under <code>context.channel</code>.</li>
          <li>Rename array contribution <code>key</code> fields to <code>id</code>.</li>
          <li>Read project, session, and agent state from their dedicated context fields.</li>
          <li>Delete guards that duplicate the new runtime schemas.</li>
        </ol>
      </Prose>

      <H2 id="protocol">Replace the raw channel</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          filename="src/protocol.ts"
          code={`import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const protocol = defineProtocol({
  methods: {
    state: { result: z.object({ enabled: z.boolean() }) },
    setEnabled: {
      params: z.object({ enabled: z.boolean() }),
      result: z.object({ enabled: z.boolean() }),
    },
  },
  events: {
    changed: z.object({ enabled: z.boolean() }),
  },
});`}
        />
      </div>

      <H2 id="host">Replace method registration</H2>
      <Prose>
        <p>
          Instead of registering methods one at a time, connect the whole table.
          A reload then replaces removed methods rather than leaving them behind.
        </p>
      </Prose>
      <div className="measure mt-4 grid gap-4 md:grid-cols-2">
        <Code
          lang="ts"
          filename="0.x"
          code={`const channel = connect("@acme/package");
channel.method("state", () => state);
channel.method("setEnabled", update);`}
        />
        <Code
          lang="ts"
          filename="1.x"
          code={`const host = connect("@acme/package", protocol, {
  state: () => state,
  setEnabled: update,
});`}
        />
      </div>

      <H2 id="renderer">Update renderer context</H2>
      <div className="measure mt-4 grid gap-4 md:grid-cols-2">
        <Code
          lang="tsx"
          filename="0.x"
          code={`render: (ctx) => {
  ctx.call("state");
  ctx.on("changed", update);
  return <Panel project={ctx.session?.cwd} />;
}`}
        />
        <Code
          lang="tsx"
          filename="1.x"
          code={`render: (context) => {
  context.channel.call("state");
  context.channel.on("changed", update);
  return <Panel project={context.project.path} />;
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          The old nullable session object is now a stable shape. A new chat uses
          <code> context.session.file: null</code>. The old <code>dark</code> flag
          was removed because renderers style against semantic color variables,
          which update with NativePi&apos;s light, dark, and custom appearances.
        </p>
      </Prose>

      <H2 id="compatibility">Load behavior</H2>
      <Prose>
        <p>
          NativePi rejects a 0.x renderer before running any contribution and
          reports a compatibility error. The package&apos;s ordinary Pi extension
          still loads, so terminal behavior and non-graphical tools remain
          available during migration.
        </p>
      </Prose>

      <Note>
        Test the empty session, method failure, event update, extension reload,
        and Pi terminal path after migrating. Version 1 validates more failures
        at their source, which may expose data that the raw channel previously
        accepted.
      </Note>

      <H2 id="related">Related guides</H2>
      <Prose>
        <ul>
          <li><Link href="/docs/extension-api/protocols">Typed protocols</Link></li>
          <li><Link href="/docs/extension-api/host-channel">Host channel</Link></li>
          <li><Link href="/docs/extension-api/reference">API reference</Link></li>
        </ul>
      </Prose>
    </>
  );
}
