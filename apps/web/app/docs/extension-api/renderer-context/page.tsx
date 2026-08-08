import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Renderer context",
  description: "Use NativePi renderer project, session, agent, channel, and desktop action APIs safely from graphical contributions.",
};

export default function RendererContextPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Renderer context"
        lede="Every contribution receives the current project, session, and agent view, a typed channel, and a small set of desktop actions. Treat the context as read-only render input."
      />

      <H2 id="shape">Context shape</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface RendererContext<Protocol extends ExtensionProtocol> {
  extension: { id: string; name: string };
  project: { path: string; name: string };
  session: { file: string | null; name?: string };
  agent: {
    status: "idle" | "starting" | "ready" | "error" | "exited";
    running: boolean;
    model?: {
      provider: string;
      id: string;
      name?: string;
      reasoning?: boolean;
      contextWindow?: number;
    };
    thinkingLevel: string;
  };
  channel: RendererChannel<Protocol>;
  actions: RendererActions;
}`}
        />
      </div>

      <H2 id="view-state">Read view state</H2>
      <Prose>
        <p>
          The context object is rebuilt when visible state changes. Read project,
          session, and agent fields during render rather than copying them into
          component state. A new chat has <code>session.file: null</code>; design
          that empty state explicitly.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`function SessionStatus({ context }: { context: RendererContext }) {
  if (!context.session.file) return <p>Start a chat to load session data.</p>;

  return (
    <p>
      {context.session.name ?? "Untitled session"}
      {context.agent.running ? " · Running" : " · Idle"}
    </p>
  );
}`}
        />
      </div>

      <H2 id="channel">Use the channel in effects</H2>
      <Prose>
        <p>
          <code>channel.call</code> and <code>channel.on</code> keep stable
          identities until the extension reloads. Destructure those functions
          and use them as effect dependencies; do not depend on the full context
          object.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`const { call, on } = context.channel;

useEffect(() => {
  let active = true;
  void call("state").then((state) => {
    if (active) setState(state);
  });

  const unsubscribe = on("changed", setState);
  return () => {
    active = false;
    unsubscribe();
  };
}, [call, on]);`}
        />
      </div>

      <H2 id="actions">Desktop actions</H2>
      <Prose>
        <ul>
          <li><code>notify(message, tone?)</code> shows a NativePi notification attributed to the extension.</li>
          <li><code>insertIntoComposer(text)</code> edits the active draft without sending it.</li>
          <li><code>openExternal(url)</code> opens an HTTP or HTTPS URL in the default browser.</li>
          <li><code>openFile(file, location?)</code> opens a project-relative file in the preferred editor.</li>
          <li><code>revealFile(file)</code> reveals a project-relative file in the platform file manager.</li>
          <li><code>copyText(text)</code> writes plain text to the active client&apos;s clipboard.</li>
        </ul>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<Button
  onClick={async () => {
    try {
      await context.actions.openFile("src/index.ts", { line: 24, column: 3 });
    } catch (error) {
      context.actions.notify(String(error), "error");
    }
  }}
>
  Open source
</Button>`}
        />
      </div>

      <Note>
        Action promises reject when the request is invalid or the desktop
        operation fails. Handle the rejection where the reader can act on it.
        Paths passed to file actions are relative to the current project.
      </Note>

      <H2 id="next">Choose a surface</H2>
      <Prose>
        <p>
          The same context reaches every slot. Read{" "}
          <Link href="/docs/extension-api/contributions">Contribution slots</Link>{" "}
          to choose where your component belongs.
        </p>
      </Prose>
    </>
  );
}
