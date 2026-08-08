import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Composer contributions",
  description: "Add compact NativePi composer controls and above- or below-composer widgets from a graphical extension.",
};

export default function ComposerContributionsPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Composer contributions"
        lede="Composer slots are for state and actions tied to the next message. They stay deliberately small so the conversation and input remain usable at narrow widths."
      />

      <H2 id="controls">Composer controls</H2>
      <Prose>
        <p>
          A control sits in the compact row beside NativePi&apos;s model and
          thinking controls. Use it for one frequent action or a concise mode
          selector.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`export default defineRenderer({
  apiVersion: 1,
  composerControls: [
    {
      id: "query-mode",
      render: (context) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => context.actions.insertIntoComposer("Run as read-only: ")}
        >
          Read-only query
        </Button>
      ),
    },
  ],
});`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Return one small interactive element. Put configuration in settings
          and detailed output in a dialog or panel rather than expanding the
          control row.
        </p>
      </Prose>

      <H2 id="widgets">Composer widgets</H2>
      <Prose>
        <p>
          A widget spans the composer immediately above or below it. Use the
          placement that matches its relationship to the input; most
          next-message context belongs above.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`export default defineRenderer({
  apiVersion: 1,
  protocol: deployProtocol,
  composerWidgets: [
    {
      id: "deploy-target",
      placement: "aboveComposer",
      render: (context) => <DeployTarget context={context} />,
    },
  ],
});`}
        />
      </div>

      <H2 id="placement">Placement rules</H2>
      <Prose>
        <ul>
          <li>
            <code>aboveComposer</code> works for selected targets, modes,
            validation, and context that affects the draft.
          </li>
          <li>
            <code>belowComposer</code> works for compact status or helper actions
            that should follow NativePi&apos;s own controls.
          </li>
        </ul>
      </Prose>

      <Note>
        Keep a widget to one compact row whenever possible. A tall widget pushes
        the transcript out of view, and narrow layouts protect the composer
        before extension content. Use a{" "}
        <Link href="/docs/extension-api/panels-and-settings">context panel</Link>{" "}
        for information the reader consults at length.
      </Note>

      <H2 id="behavior">Interaction behavior</H2>
      <Prose>
        <ul>
          <li>Inserting text must not send the message on the reader&apos;s behalf.</li>
          <li>Disable or explain actions that require an active session when <code>session.file</code> is null.</li>
          <li>Show host-call failures near the control rather than leaving a rejected promise.</li>
          <li>Use shared controls so focus, disabled, hover, and reduced-motion behavior match NativePi.</li>
        </ul>
        <p>
          See <Link href="/docs/extension-api/ui">Shared UI</Link> for the
          available button, select, menu, and dialog components.
        </p>
      </Prose>
    </>
  );
}
