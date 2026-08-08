import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Extension host channel",
  description: "Connect a Pi extension to its NativePi renderer with typed method handlers and host events.",
};

export default function HostChannelPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Host channel"
        lede="The host channel lets browser UI call into the Pi extension that owns the capability. It preserves the process boundary instead of moving extension logic into the window."
      />

      <H2 id="connect">Connect the Pi entry</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          filename="src/extension.ts"
          code={`import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { taskProtocol } from "./protocol.ts";

interface Task {
  id: string;
  title: string;
  complete: boolean;
}

export default function taskExtension(pi: ExtensionAPI) {
  let tasks: Task[] = [];

  const host = connect("@acme/tasks", taskProtocol, {
    list: () => tasks,
    add: ({ title }) => {
      const task = { id: crypto.randomUUID(), title, complete: false };
      tasks = [...tasks, task];
      host.emit("changed", tasks);
      return task;
    },
    clear: () => {
      tasks = [];
      host.emit("changed", tasks);
      return null;
    },
  });
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          The first argument must exactly match the owning package&apos;s manifest
          name. The protocol determines the complete handler table, so missing,
          extra, or incorrectly typed handlers fail during development or
          registration.
        </p>
      </Prose>

      <H2 id="atomic-registration">Atomic registration</H2>
      <Prose>
        <p>
          <code>connect</code> registers all methods at once. Calling it again for
          the same package replaces the previous table rather than merging into
          it. Package reloads therefore cannot leave a removed handler active.
        </p>
      </Prose>

      <H2 id="events">Emit events</H2>
      <Prose>
        <p>
          Use the returned host to publish state changes that renderers may be
          watching. Event names and payloads come from the shared protocol.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`host.emit("changed", tasks);
host.emit("invalidated");`}
        />
      </div>

      <H2 id="terminal">Behavior outside NativePi</H2>
      <Prose>
        <p>
          Pi&apos;s terminal UI does not provide the graphical host. The returned
          object reports <code>connected: false</code>, and valid{" "}
          <code>emit</code> calls become no-ops. Method handlers remain type
          checked and can still be used by the extension itself.
        </p>
        <p>
          Keep a terminal-accessible command, tool, or Pi UI for any capability
          that needs to remain usable there. Do not import renderer components
          into the Pi entry.
        </p>
      </Prose>

      <Note>
        NativePi&apos;s standard Pi extension UI and the graphical API are separate.
        Continue to use <code>context.ui</code> for Pi-owned prompts and terminal
        components. Use this channel only when a persistent React contribution
        needs extension data or actions.
      </Note>

      <H2 id="failures">Failure behavior</H2>
      <Prose>
        <p>A renderer call rejects when:</p>
        <ul>
          <li>The method is not declared or registered</li>
          <li>Parameters or results fail their schemas</li>
          <li>The handler throws</li>
          <li>The call exceeds thirty seconds</li>
          <li>The active chat changes before the response returns</li>
        </ul>
        <p>
          Catch call failures in the renderer and show an actionable state near
          the control that initiated them. Continue with{" "}
          <Link href="/docs/extension-api/renderer-context">Renderer context</Link>{" "}
          for the browser side of the channel.
        </p>
      </Prose>
    </>
  );
}
