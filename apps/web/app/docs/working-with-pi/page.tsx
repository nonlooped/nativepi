import type { Metadata } from "next";
import Link from "next/link";

import { Code } from "@/components/site/Code";
import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "Working with Pi",
  description:
    "Where sessions live, what NativePi stores, how settings are shared with the Pi command line, and what the optional local server does.",
};

export default function WorkingWithPiPage() {
  return (
    <>
      <PageTitle
        eyebrow="Getting started"
        title="Working with Pi"
        lede="NativePi is a window onto Pi, not a replacement for it. Knowing which of the two owns what makes the rest of the app predictable."
      />

      <H2 id="who-owns-what">Who owns what</H2>
      <Prose>
        <p>
          Pi owns the agent loop, providers, models, authentication, tools,
          prompts, skills, extensions, queues, compaction, and sessions. NativePi
          calls Pi and renders the result. It has no agent loop, makes no model
          requests of its own, and adds no tools.
        </p>
        <p>
          A pinned Pi build is bundled with each release and started in RPC mode.
          NativePi keeps at most one Pi process per project, and different
          projects can run at the same time.
        </p>
      </Prose>

      <H2 id="sessions">Sessions and credentials</H2>
      <Prose>
        <p>
          Conversations are Pi session files. They live in Pi&apos;s normal
          storage and remain fully interchangeable with the Pi command line.
          There is no second conversation store.
        </p>
      </Prose>

      <div className="measure mt-5">
        <Code
          lang="shell"
          code={`~/.pi/agent
├── sessions/      # conversations, shared with the pi CLI
├── packages/      # installed Pi packages
├── settings.json  # agent configuration
└── auth.json      # provider auth, never held by NativePi`}
        />
      </div>

      <Prose className="mt-6">
        <p>
          Conversations open directly from session files without waiting for a Pi
          process to start, so resuming is immediate. Credentials are never
          written to NativePi&apos;s renderer storage or its state file.
        </p>
      </Prose>

      <H3 id="session-workflows">What you can do to a session</H3>
      <Prose>
        <p>
          Create, resume, rename, clone, fork, delete, import, export to HTML,
          inspect the session tree and statistics, and compact. These workflows
          use Pi&apos;s session formats and APIs; NativePi performs the small
          desktop-side file operations where Pi has no direct command.
        </p>
      </Prose>

      <H2 id="nativepi-storage">What NativePi stores</H2>
      <Prose>
        <p>This is the complete list:</p>
        <ul>
          <li>Pinned projects</li>
          <li>The last project and chat you had open</li>
          <li>Unsent text drafts</li>
          <li>Favorite models</li>
          <li>Pane sizes</li>
          <li>Its own appearance and notification preferences</li>
        </ul>
        <p>
          No conversations, no credentials, no telemetry. Nothing leaves your
          machine.
        </p>
      </Prose>

      <H2 id="settings">Settings</H2>
      <Prose>
        <p>
          Agent configuration belongs to Pi. NativePi reads and writes it through
          Pi&apos;s own settings manager at user scope, so a change you make in
          the Settings screen is a change the Pi command line sees immediately.
          NativePi never writes Pi&apos;s configuration format itself, and it
          exposes only the settings that mean something in a desktop window.
        </p>
        <p>
          Project-scope overrides remain the command line&apos;s business.
          NativePi does not edit them.
        </p>
      </Prose>

      <H2 id="git">Git</H2>
      <Prose>
        <p>
          The context pane shows Git status and working-tree diffs beside the
          transcript. From the composer you can switch or create a branch, and
          from the project menu you can add a worktree, which is then added as a
          NativePi project of its own.
        </p>
      </Prose>

      <Note>
        Git access is deliberately narrow. Branch checkout and creation require a
        clean worktree. NativePi does not stage, commit, merge, rebase, discard
        changes, create checkpoints, roll back work, or rewrite history. Those
        stay with your normal tools.
      </Note>

      <H2 id="extensions">Pi packages and extensions</H2>
      <Prose>
        <p>
          Normal Pi extensions run inside Pi, unchanged. NativePi can install,
          update, remove, and reload Pi packages at user or project scope, and it
          shows load errors rather than swallowing them.
        </p>
        <p>
          Pi&apos;s own slash commands, prompt templates, and skills are offered
          by name in the composer and run through Pi, including while a turn is
          already in flight. An extension that wants to draw its own desktop UI
          uses the{" "}
          <Link href="/docs/extension-api">graphical extension API</Link>.
        </p>
      </Prose>

      <H2 id="terminals">Terminals</H2>
      <Prose>
        <p>
          Each project can open integrated terminals in a resizable split. They
          stay alive while hidden and while another project is in front. If
          closing the window would stop an agent turn or a terminal, NativePi
          names what it would stop before quitting.
        </p>
      </Prose>

      <H2 id="local-server">Browser access</H2>
      <Prose>
        <p>
          NativePi can open an access-token-protected HTTP and WebSocket server
          on your local network, presenting the same projects, chats, changes,
          and terminals in a browser while the desktop app stays open. It runs
          until you stop it or NativePi exits.
        </p>
      </Prose>

      <Note tone="warning">
        The server is off until you start it. It listens on this computer&apos;s
        network interfaces, so your firewall, VPN, and router determine which
        devices can reach it. Use it only on networks you trust. NativePi does
        not operate a hosted relay or send your workspace to a NativePi server.
      </Note>
    </>
  );
}
