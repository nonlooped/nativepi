import type { Metadata } from "next";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "Settings and customization",
  description:
    "Customize NativePi appearance, color schemes, notifications, shortcuts, editors, and Pi settings.",
};

export default function SettingsAndCustomizationPage() {
  return (
    <>
      <PageTitle
        eyebrow="Using NativePi"
        title="Settings and customization"
        lede="NativePi separates window preferences from agent configuration. Interface choices stay in NativePi; Pi settings remain Pi settings and work in the command line too."
      />

      <H2 id="appearance">Appearance and color schemes</H2>
      <Prose>
        <p>
          Follow the operating system appearance or choose light or dark mode.
          NativePi includes ten color schemes, each tuned separately for both
          appearances. You can also create named schemes by editing semantic
          colors, then export or import them as JSON.
        </p>
      </Prose>

      <H2 id="shortcuts">Keyboard shortcuts</H2>
      <Prose>
        <p>
          The shortcut list shows every rebindable action. Select a shortcut and
          press the new key combination; NativePi reports conflicts before it
          saves the change. Reset an individual shortcut or restore all defaults
          at any time.
        </p>
      </Prose>

      <H2 id="desktop-preferences">Desktop preferences</H2>
      <Prose>
        <p>
          NativePi owns notification preferences, the preferred editor, pane
          state, and other window behavior. These settings affect only the
          desktop and browser surfaces, not how Pi runs a turn.
        </p>
      </Prose>

      <H2 id="pi-settings">Pi settings</H2>
      <Prose>
        <p>
          Settings exposes the user-scoped Pi options that make sense in a
          desktop window. NativePi reads and writes them through Pi&apos;s settings
          manager rather than editing its file format. The Pi command line sees
          the same values.
        </p>
      </Prose>

      <Note>
        Project-scoped Pi overrides remain managed through Pi. NativePi also
        shows the paths to Pi&apos;s settings, authentication, packages, and session
        files when you need to inspect them directly.
      </Note>
    </>
  );
}
