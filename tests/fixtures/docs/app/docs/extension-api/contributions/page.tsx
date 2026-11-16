import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Extension contribution slots",
  description: "Choose between NativePi tool, entry, composer, conversation view, context panel, and settings contribution slots.",
};

export default function ContributionsPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Contribution slots"
        lede="NativePi controls where extension UI can appear. Choose the narrowest slot that matches the information's lifetime and the reader's task."
      />

      <H2 id="choose">Choose a slot</H2>
      <Prose>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Use it for</th>
                <th>Avoid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>tools</code></td>
                <td>Call progress and structured results in the transcript</td>
                <td>Persistent project controls</td>
              </tr>
              <tr>
                <td><code>entries</code></td>
                <td>Custom durable session entries</td>
                <td>Data that should enter model context</td>
              </tr>
              <tr>
                <td><code>composerWidgets</code></td>
                <td>State that affects the next message</td>
                <td>Tall, consultative content</td>
              </tr>
              <tr>
                <td><code>composerControls</code></td>
                <td>One compact, frequent action or mode</td>
                <td>Forms or multi-step interactions</td>
              </tr>
              <tr>
                <td><code>conversationViews</code></td>
                <td>A complete extension workspace opened from the chat header</td>
                <td>Small controls or turn feedback</td>
              </tr>
              <tr>
                <td><code>panels</code></td>
                <td>Project information consulted beside the transcript</td>
                <td>Urgent turn feedback</td>
              </tr>
              <tr>
                <td><code>settings</code></td>
                <td>Durable extension configuration</td>
                <td>NativePi-only copies of Pi state</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Prose>

      <H2 id="definition">Renderer definition</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`export default defineRenderer({
  apiVersion: 1,
  protocol,
  tools: {},
  entries: {},
  composerWidgets: [],
  composerControls: [],
  conversationViews: [],
  panels: [],
  settings: [],
});`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Every field except <code>apiVersion</code> is optional. Tool and entry
          renderers are records keyed by the Pi name or session-entry type. Array
          contributions use a unique, stable <code>id</code> within their slot.
          NativePi rejects duplicate IDs.
        </p>
      </Prose>

      <H2 id="ownership">Ownership and conflicts</H2>
      <Prose>
        <p>
          The first configured extension with a renderer for a given tool name or
          entry type owns that visual renderer. Array contributions coexist and
          are identified by package plus contribution ID.
        </p>
        <p>
          Contributions cannot replace application navigation, routing, or the
          agent loop. A conversation view may replace the transcript and composer
          within the existing conversation pane while it is open. Use Pi APIs
          for anything that changes model context, tools, commands, sessions, or
          turn sequencing.
        </p>
      </Prose>

      <Note>
        Keep the surrounding interface legible when your contribution fails or
        has no data. NativePi adds an error boundary, but an exception still
        removes that contribution until it can render again.
      </Note>

      <H2 id="guides">Slot guides</H2>
      <Prose>
        <ul>
          <li><Link href="/docs/extension-api/tools-and-entries">Tool and entry renderers</Link></li>
          <li><Link href="/docs/extension-api/composer">Composer contributions</Link></li>
          <li><Link href="/docs/extension-api/panels-and-settings">Panels and settings</Link></li>
          <li><Link href="/docs/extension-api/ui">Shared UI components</Link></li>
        </ul>
      </Prose>
    </>
  );
}
