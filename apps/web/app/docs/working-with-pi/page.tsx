import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "NativePi and Pi",
  description: "Understand how NativePi presents Pi without replacing its agent loop, configuration, sessions, tools, or extensions.",
};

export default function WorkingWithPiPage() {
  return (
    <>
      <PageTitle
        eyebrow="Using NativePi"
        title="NativePi and Pi"
        lede="Pi is the coding agent. NativePi is a desktop interface that starts Pi, sends it ordinary commands, and renders what it returns."
      />

      <H2 id="pi-owns">What Pi owns</H2>
      <Prose>
        <p>
          Pi owns the agent loop, provider and model integrations,
          authentication, tools, prompts, skills, extensions, message queues,
          compaction, and sessions. A NativePi chat runs a pinned Pi build in RPC
          mode rather than reproducing those capabilities in the desktop app.
        </p>
        <p>
          This means a prompt sent under the same Pi configuration should behave
          similarly in NativePi and Pi&apos;s terminal interface.
        </p>
      </Prose>

      <H2 id="nativepi-owns">What NativePi owns</H2>
      <Prose>
        <p>
          NativePi owns desktop concerns: pinned projects and chats, panes,
          drafts, integrated terminals, narrow Git workflows, browser access,
          notifications, keyboard shortcuts, and its window preferences. It also
          exposes controlled graphical slots for packages that opt into the{" "}
          <Link href="/docs/extension-api">extension API</Link>.
        </p>
      </Prose>

      <H2 id="processes">How chats run</H2>
      <Prose>
        <p>
          Each active chat gets its own Pi process. Chats in one project or
          across several projects can run concurrently. Opening a saved
          conversation does not wait for Pi to start because NativePi reads Pi&apos;s
          session file for display, then starts the process when the chat needs
          agent work.
        </p>
      </Prose>

      <H2 id="configuration">Shared configuration</H2>
      <Prose>
        <p>
          Agent settings shown in NativePi are read and written through Pi&apos;s
          settings manager at user scope. The Pi command line sees those changes
          immediately. Project-scope overrides remain managed through Pi.
        </p>
        <p>
          NativePi bundles a pinned Pi version, so it may not match a separately
          installed CLI version at every moment. Both still use Pi&apos;s normal
          files and formats.
        </p>
      </Prose>

      <Note>
        Uninstalling NativePi does not uninstall Pi data. Your agent workflow
        remains available through the Pi command line because NativePi never
        creates a second conversation store.
      </Note>

      <H2 id="related">Related guides</H2>
      <Prose>
        <ul>
          <li><Link href="/docs/sessions-and-storage">Sessions and storage</Link></li>
          <li><Link href="/docs/packages-and-extensions">Packages and extensions</Link></li>
          <li><a href="https://pi.dev/" target="_blank" rel="noreferrer noopener">Pi documentation</a></li>
        </ul>
      </Prose>
    </>
  );
}
