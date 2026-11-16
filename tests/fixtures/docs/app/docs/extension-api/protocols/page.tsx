import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Typed extension protocols",
  description: "Define schema-validated methods and events shared by a NativePi renderer and its Pi extension host.",
};

export default function ProtocolsPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Typed protocols"
        lede="A protocol is the single source of truth for renderer-to-host method calls and host-to-renderer events. TypeScript infers it and both processes validate it."
      />

      <H2 id="define">Define a protocol</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          filename="src/protocol.ts"
          code={`import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

const task = z.object({
  id: z.string(),
  title: z.string(),
  complete: z.boolean(),
});

export const taskProtocol = defineProtocol({
  methods: {
    list: { result: z.array(task) },
    add: {
      params: z.object({ title: z.string().min(1) }),
      result: task,
    },
    clear: { result: z.null() },
  },
  events: {
    changed: z.array(task),
    invalidated: undefined,
  },
});`}
        />
      </div>

      <H2 id="methods">Methods</H2>
      <Prose>
        <p>
          Every method declares a <code>result</code> schema. Add a{" "}
          <code>params</code> schema when the method takes one argument; omit it
          when the method takes no arguments. Use <code>z.null()</code> for an
          action with no meaningful result so the response is still explicit
          JSON.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`await context.channel.call("list");
await context.channel.call("add", { title: "Review diff" });
await context.channel.call("clear");`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          A params schema whose output includes <code>undefined</code> makes the
          argument optional. Otherwise TypeScript requires exactly one argument.
        </p>
      </Prose>

      <H2 id="events">Events</H2>
      <Prose>
        <p>
          An event maps directly to its payload schema. Use <code>undefined</code>{" "}
          for a payload-free event. The host emits events and the renderer
          subscribes:
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`host.emit("changed", tasks);
host.emit("invalidated");

const off = context.channel.on("changed", (nextTasks) => {
  setTasks(nextTasks);
});

// Call when the component unmounts.
off();`}
        />
      </div>

      <H2 id="validation">Validation path</H2>
      <Prose>
        <ul>
          <li>Method parameters are validated before leaving the renderer.</li>
          <li>The Pi host validates parameters again before invoking a handler.</li>
          <li>Method results are validated in the host and again in the renderer.</li>
          <li>Event payloads are validated when emitted and before each listener runs.</li>
        </ul>
        <p>
          Errors identify the method or event where invalid data originated,
          which is more useful than allowing a malformed value to fail later in
          React.
        </p>
      </Prose>

      <H2 id="json">JSON-compatible values</H2>
      <Prose>
        <p>
          Values may contain null, booleans, finite numbers, strings, arrays, and
          plain objects containing those values. Do not send class instances,
          functions, symbols, dates, maps, sets, binary buffers, cyclic objects,
          <code>NaN</code>, or infinities. Convert them to explicit JSON shapes.
        </p>
      </Prose>

      <Note>
        Schemas run on the same value more than once. Keep them idempotent and
        shape-preserving. Use validation and defaults, not a one-way transform
        whose output would fail the next parse.
      </Note>

      <H2 id="custom-schemas">Schema libraries</H2>
      <Prose>
        <p>
          The recommended Zod export comes from{" "}
          <code>@nativepi/extension-api/schema</code>. NativePi provides that
          module to renderer bundles. Any synchronous object with a compatible{" "}
          <code>parse(value)</code> method and JSON-compatible output also works.
        </p>
        <p>
          Next, implement the protocol with the{" "}
          <Link href="/docs/extension-api/host-channel">host channel</Link>.
        </p>
      </Prose>
    </>
  );
}
