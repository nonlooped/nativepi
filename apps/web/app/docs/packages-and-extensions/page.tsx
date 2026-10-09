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
          Open <strong>Settings → Extensions</strong> to install, update, remove, or
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
        <p>
          Reload after running turns finish. NativePi does not restart Pi in the
          middle of a turn to apply a package change.
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

      <H2 id="mcp">Connect tools with MCP</H2>
      <Prose>
        <p>
          Pi includes MCP support. Configure servers in <code>~/.pi/agent/mcp.json</code>
          or a trusted project&apos;s <code>.pi/mcp.json</code>, then type <code>/mcp</code> in the
          composer to inspect their status. Pi owns the connections, tools, and
          sign-in flow, so the same setup works in its command line.
        </p>
        <p>
          Prefer Pi&apos;s built-in support for new connections. If you use the
          optional <code>@nativepi/mcp</code> connection editor, disable Pi&apos;s
          built-in MCP extension with <code>{'"extensions": ["-builtin:mcp"]'}</code>{" "}
          in Pi settings to avoid connecting each server twice. Add that exclusion
          alongside existing entries. This package&apos;s graphical editor is under
          <strong> Settings → Extensions → MCP servers</strong>; it exposes tools
          but does not implement Pi&apos;s built-in OAuth, resources, prompts, or
          tool search. Remove the exclusion when returning to the built-in support.
        </p>
        <p>
          See Pi&apos;s{" "}
          <a href="https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md" target="_blank" rel="noreferrer noopener">
            MCP guide
          </a>{" "}
          for server configuration, tool exposure, and authentication.
        </p>
      </Prose>

      <H2 id="graphical-extensions">Graphical extensions</H2>
      <Prose>
        <p>
          A package can additionally declare a browser renderer through{" "}
          <code>nativepi.renderer</code>. That renderer adds React UI to
          controlled transcript, composer, conversation-view, context-pane, and
          settings slots. It does not replace Pi&apos;s extension entry or change
          what reaches the model.
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
          <a href="https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md" target="_blank" rel="noreferrer noopener">
            package documentation
          </a>{" "}
          for package sources, filters, conventional directories, dependencies,
          and scope resolution.
        </p>
      </Prose>
    </>
  );
}
