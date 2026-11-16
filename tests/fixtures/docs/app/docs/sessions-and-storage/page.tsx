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
├── npm/           # npm-sourced packages installed by Pi
├── git/           # git-sourced packages installed by Pi
├── settings.json  # agent configuration and package declarations
├── mcp.json       # optional MCP server configuration
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
        <p>
          These are the default locations. Pi honors <code>PI_CODING_AGENT_DIR</code>
          for a custom agent directory and <code>PI_CODING_AGENT_SESSION_DIR</code>
          for session storage. Check <strong>Settings → System</strong> for the
          agent directory this app uses. Local packages remain at their original
          paths.
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
        <p>
          Right-click a chat for its actions, including <strong>View chat branches…</strong>,
          <strong> Export to HTML</strong>, and <strong>Delete chat…</strong>.
          Choose <strong>Import an existing chat</strong> from the project actions
          menu, or drop a Pi session file into the window.
        </p>
      </Prose>

      <H2 id="nativepi-data">NativePi data</H2>
      <Prose>
        <p>NativePi persists only interface state:</p>
        <ul>
          <li>Pinned projects and chats</li>
          <li>Focus and Finished organization</li>
          <li>The last open project and chat</li>
          <li>Unsent text drafts</li>
          <li>Favorite models</li>
          <li>Pane sizes</li>
          <li>Custom color schemes and source-control preferences</li>
          <li>Appearance, notification, and keyboard-shortcut preferences</li>
          <li>The selected Stable or Nightly release channel</li>
        </ul>
        <p>
          It does not put conversations or credentials in that state file and
          does not send NativePi-owned desktop telemetry. Pi&apos;s optional
          analytics remain a Pi setting.
        </p>
        <p>
          The desktop state file is <code>state.json</code> in Electron&apos;s
          per-user app data directory. Removing that file resets NativePi&apos;s
          interface state; it does not delete Pi sessions or credentials.
        </p>
        <p>
          The release-channel preference is stored separately in
          <code> update-channel.json</code> in the same app data directory.
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
