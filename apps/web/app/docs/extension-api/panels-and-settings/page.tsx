import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Panels and settings contributions",
  description: "Add NativePi context panels and settings sections while keeping durable extension state owned by Pi.",
};

export default function PanelsAndSettingsPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Panels and settings"
        lede="Panels hold project information beside the transcript. Settings sections configure the extension, while the Pi half remains responsible for reading and writing durable state."
      />

      <H2 id="panels">Context panels</H2>
      <Prose>
        <p>
          A panel appears in the project context pane beside NativePi&apos;s Git
          surfaces. It is the roomiest contribution slot and the right place for
          information the reader consults rather than reads inline.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`export default defineRenderer({
  apiVersion: 1,
  protocol: schemaProtocol,
  panels: [
    {
      id: "database-schema",
      title: "Database schema",
      render: (context) => (
        <SchemaTree projectPath={context.project.path} channel={context.channel} />
      ),
    },
  ],
});`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Panels render for a new chat as well as a saved session. Use project
          state without assuming <code>session.file</code> exists. Keep frequent
          actions near the information they affect, but avoid turning a panel
          into a second application shell.
        </p>
      </Prose>

      <H2 id="settings">Settings sections</H2>
      <Prose>
        <p>
          A section appears under <strong>Settings → General</strong>. NativePi
          draws the heading and optional description; the renderer supplies the
          controls.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`export default defineRenderer({
  apiVersion: 1,
  protocol: settingsProtocol,
  settings: [
    {
      id: "query-settings",
      heading: "Query settings",
      description: "Choose how this package runs database queries.",
      render: (context) => <QuerySettings context={context} />,
    },
  ],
});`}
        />
      </div>

      <H2 id="persistence">Persist through the Pi host</H2>
      <Prose>
        <p>
          Renderer storage would create settings that exist only in NativePi and
          disappear from the extension in Pi&apos;s terminal UI. Instead, define
          protocol methods that read and update the extension&apos;s settings in the
          Pi process.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`export const settingsProtocol = defineProtocol({
  methods: {
    getSettings: { result: settingsSchema },
    updateSettings: {
      params: settingsSchema.partial(),
      result: settingsSchema,
    },
  },
  events: {
    settingsChanged: settingsSchema,
  },
});`}
        />
      </div>

      <Note>
        The extension decides where its configuration belongs and how it is
        stored. Do not write directly to Pi&apos;s settings format from the browser
        renderer, and do not keep a durable copy in <code>localStorage</code>.
      </Note>

      <H2 id="controls">Settings controls</H2>
      <Prose>
        <p>
          The shared UI exports complete settings rows for common values:
          <code> SettingsActionRow</code>, <code>SettingsSwitchRow</code>,{" "}
          <code>SettingsSelectRow</code>, <code>SettingsTextRow</code>, and{" "}
          <code>SettingsSliderRow</code>. Use them before assembling custom field
          layouts.
        </p>
        <p>
          See <Link href="/docs/extension-api/ui#settings-rows">Shared UI settings rows</Link>{" "}
          for their props.
        </p>
      </Prose>
    </>
  );
}
