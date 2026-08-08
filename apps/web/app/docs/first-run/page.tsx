import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "First run",
  description:
    "Add a project, review project trust, authenticate a provider, select a model, and start your first NativePi chat.",
};

export default function FirstRunPage() {
  return (
    <>
      <PageTitle
        eyebrow="Getting started"
        title="First run"
        lede="A project, a provider, and a model are all you need to start. NativePi keeps each choice in the Pi or desktop-owned storage where it belongs."
      />

      <H2 id="add-project">1. Add a project</H2>
      <Prose>
        <p>
          Select the folder button beside <strong>Projects</strong> in the left
          sidebar and choose a local folder. NativePi pins the folder so it is
          available the next time you open the app. You can also drop a folder
          anywhere in the window.
        </p>
      </Prose>

      <H2 id="review-trust">2. Review project trust</H2>
      <Prose>
        <p>
          Pi asks for trust when a project contains local code or instructions,
          including extensions or skills. Trusting the folder allows those
          resources to load with your system permissions. Review the project
          before approving it.
        </p>
      </Prose>

      <Note tone="warning">
        Project-local extensions are executable code. Trust only folders whose
        contents and origin you understand.
      </Note>

      <H2 id="authenticate">3. Authenticate a provider</H2>
      <Prose>
        <p>
          Open <strong>Settings</strong>, choose a provider, and complete its
          authentication flow. Pi performs authentication and writes credentials
          to its own <code>auth.json</code>. NativePi does not copy credentials
          into renderer storage.
        </p>
        <p>
          If you already use the Pi command line, your existing authentication
          is available immediately.
        </p>
      </Prose>

      <H2 id="start-chat">4. Start a chat</H2>
      <Prose>
        <p>
          Create a chat, choose a model and thinking level beneath the composer,
          then send a prompt. You can change the model or thinking level later,
          including while a turn is running.
        </p>
        <p>
          Paste or drop an image into the composer to attach it. Drop another
          file to insert an <code>@</code> path mention instead.
        </p>
      </Prose>

      <H2 id="next">Where to go next</H2>
      <Prose>
        <ul>
          <li>
            Read <Link href="/docs/working-with-pi">NativePi and Pi</Link> to
            understand the ownership boundary.
          </li>
          <li>
            Read <Link href="/docs/sessions-and-storage">Sessions and storage</Link>{" "}
            before moving conversations between NativePi and the Pi CLI.
          </li>
          <li>
            Read <Link href="/docs/packages-and-extensions">Packages and extensions</Link>{" "}
            to add Pi capabilities.
          </li>
        </ul>
      </Prose>
    </>
  );
}
