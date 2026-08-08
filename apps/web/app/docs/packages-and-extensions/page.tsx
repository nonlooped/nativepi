import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Packages and extensions",
  description: "Install and manage Pi packages in NativePi and understand ordinary, terminal, and graphical extension surfaces.",
};

export default function PackagesAndExtensionsPage() {
  return (
    <>
      <PageTitle
        eyebrow="Using NativePi"
        title="Packages and extensions"
        lede="Packages remain Pi packages. NativePi manages their configured sources and displays both Pi-owned extension UI and optional NativePi graphical contributions."
      />

      <Note tone="warning">
        Pi packages are trusted code with your system permissions. Review a
        package before installing it, especially when it contains extensions.
      </Note>

      <H2 id="manage">Install and manage packages</H2>
      <Prose>
        <p>
          Open NativePi&apos;s package settings to install, update, remove, or
          reload packages at user or project scope. NativePi calls Pi&apos;s package
          mechanisms and displays load errors rather than maintaining a separate
          package registry.
        </p>
        <p>The equivalent Pi CLI sources include npm, Git, and local paths:</p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="shell"
          code={`pi install npm:@scope/package
pi install git:github.com/owner/repository@v1
pi install /absolute/path/to/package
pi install -l ./relative/project-package`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          User-scoped package settings live in <code>~/.pi/agent/settings.json</code>.
          Project-scoped settings live in <code>.pi/settings.json</code> and load
          only after the project is trusted.
        </p>
      </Prose>

      <H2 id="ordinary-extensions">Ordinary Pi extensions</H2>
      <Prose>
        <p>
          Commands, tools, event handlers, skills, prompt templates, and agent
          behavior are still implemented through Pi. NativePi offers extension
          commands, templates, and skills by name in the composer.
        </p>
        <p>
          Pi&apos;s standard UI requests are also presented where possible:
          selects, confirmations, inputs, notifications, widgets, headers,
          footers, and custom terminal components. Raw terminal input and
          replacing Pi&apos;s input editor have no desktop equivalent.
        </p>
      </Prose>

      <H2 id="graphical-extensions">Graphical extensions</H2>
      <Prose>
        <p>
          A package can additionally declare a browser renderer through{" "}
          <code>nativepi.renderer</code>. That renderer adds React UI to
          controlled transcript, composer, context-pane, and settings slots. It
          does not replace Pi&apos;s extension entry or change what reaches the
          model.
        </p>
        <p>
          Start with the <Link href="/docs/extension-api">extension API overview</Link>{" "}
          or follow the <Link href="/docs/extension-api/quickstart">renderer quickstart</Link>.
        </p>
      </Prose>

      <H2 id="pi-docs">Pi package documentation</H2>
      <Prose>
        <p>
          Read Pi&apos;s own{" "}
          <a href="https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/packages.md" target="_blank" rel="noreferrer noopener">
            package documentation
          </a>{" "}
          for package sources, filters, conventional directories, dependencies,
          and scope resolution.
        </p>
      </Prose>
    </>
  );
}
