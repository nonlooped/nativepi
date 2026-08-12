import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Sessions and storage",
  description: "Learn where Pi sessions, provider credentials, packages, settings, and NativePi interface state are stored.",
};

export default function SessionsAndStoragePage() {
  return (
    <>
      <PageTitle
        eyebrow="Using NativePi"
        title="Sessions and storage"
        lede="Pi session files are the conversation source of truth. NativePi keeps only the desktop state that Pi does not own."
      />

      <H2 id="pi-data">Pi data</H2>
      <div className="measure mt-4">
        <Code
          lang="text"
          code={`~/.pi/agent
├── sessions/      # conversations shared with the Pi CLI
├── packages/      # installed Pi packages
├── settings.json  # agent configuration
└── auth.json      # provider credentials managed by Pi`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          NativePi opens and updates conversations through Pi&apos;s session formats
          and APIs. You can resume the same session from the Pi command line, and
          a session created in the command line appears in NativePi&apos;s project
          history.
        </p>
      </Prose>

      <H2 id="session-actions">Session actions</H2>
      <Prose>
        <p>
          NativePi can create, resume, rename, clone, fork, delete, import, and
          export sessions. It also presents Pi&apos;s session tree, statistics, and
          compaction workflows. Forks and clones remain ordinary Pi sessions,
          not NativePi-specific copies.
        </p>
      </Prose>

      <H2 id="nativepi-data">NativePi data</H2>
      <Prose>
        <p>NativePi persists only interface state:</p>
        <ul>
          <li>Pinned projects and chats</li>
          <li>The last open project and chat</li>
          <li>Unsent text drafts</li>
          <li>Favorite models</li>
          <li>Pane sizes</li>
          <li>Appearance, notification, and keyboard-shortcut preferences</li>
        </ul>
        <p>
          It does not put conversations or credentials in that state file and
          does not send NativePi-owned desktop telemetry. Pi&apos;s optional
          analytics remain a Pi setting.
        </p>
      </Prose>

      <H2 id="external-changes">External changes</H2>
      <Prose>
        <p>
          Because NativePi and the CLI share files, do not actively write to the
          same session from two processes. NativePi detects external changes
          where continuing could overwrite newer data and fails conservatively
          instead of silently replacing them.
        </p>
      </Prose>

      <Note>
        Closing a window with active agent turns, terminals, or connected browser
        clients produces a confirmation that names what will stop.
      </Note>

      <H2 id="related">Related guides</H2>
      <Prose>
        <ul>
          <li><Link href="/docs/working-with-pi">NativePi and Pi</Link></li>
          <li><Link href="/docs/packages-and-extensions">Packages and extensions</Link></li>
        </ul>
      </Prose>
    </>
  );
}
