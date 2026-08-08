interface DocsLink {
  href: string;
  label: string;
  description: string;
}

interface DocsSection {
  title: string;
  links: readonly DocsLink[];
}

export const docsSections = [
  {
    title: "Getting started",
    links: [
      {
        href: "/docs",
        label: "Overview",
        description: "Find the shortest path to installation, daily use, or extension development.",
      },
      {
        href: "/docs/install",
        label: "Install NativePi",
        description: "Download the right installer and handle the first-launch warning on your platform.",
      },
      {
        href: "/docs/first-run",
        label: "First run",
        description: "Add a project, review trust, authenticate a provider, and start a chat.",
      },
      {
        href: "/docs/build-from-source",
        label: "Build from source",
        description: "Run, test, build, and package NativePi from this repository.",
      },
    ],
  },
  {
    title: "Using NativePi",
    links: [
      {
        href: "/docs/working-with-pi",
        label: "NativePi and Pi",
        description: "Understand which responsibilities belong to Pi and which belong to the desktop app.",
      },
      {
        href: "/docs/sessions-and-storage",
        label: "Sessions and storage",
        description: "See where conversations, credentials, settings, and NativePi preferences live.",
      },
      {
        href: "/docs/packages-and-extensions",
        label: "Packages and extensions",
        description: "Install Pi packages and understand how terminal and graphical extension UI coexist.",
      },
      {
        href: "/docs/git",
        label: "Git and worktrees",
        description: "Review changes, stage hunks, commit, push, open pull requests, and add worktrees.",
      },
      {
        href: "/docs/browser-access",
        label: "Browser access",
        description: "Share the running workspace over your local network or a temporary public link.",
      },
    ],
  },
  {
    title: "Extension guides",
    links: [
      {
        href: "/docs/extension-api",
        label: "Extension API overview",
        description: "Learn how a Pi package can add controlled graphical surfaces to NativePi.",
      },
      {
        href: "/docs/extension-api/quickstart",
        label: "Build your first renderer",
        description: "Create a complete counter extension with a typed host and a composer control.",
      },
      {
        href: "/docs/extension-api/package-structure",
        label: "Package structure",
        description: "Separate the Pi entry, browser renderer, shared protocol, and runtime dependencies.",
      },
      {
        href: "/docs/extension-api/protocols",
        label: "Typed protocols",
        description: "Define methods and events that are inferred in TypeScript and validated at runtime.",
      },
      {
        href: "/docs/extension-api/host-channel",
        label: "Host channel",
        description: "Implement renderer calls, emit events, and preserve behavior in Pi's terminal UI.",
      },
      {
        href: "/docs/extension-api/renderer-context",
        label: "Renderer context",
        description: "Read project, session, and agent state and invoke safe desktop actions.",
      },
      {
        href: "/docs/extension-api/contributions",
        label: "Contribution slots",
        description: "Choose the NativePi surface that matches the information or interaction you are adding.",
      },
      {
        href: "/docs/extension-api/tools-and-entries",
        label: "Tools and entries",
        description: "Render tool lifecycle states and custom session entries inside the transcript.",
      },
      {
        href: "/docs/extension-api/composer",
        label: "Composer contributions",
        description: "Add compact controls or message-scoped state around the composer.",
      },
      {
        href: "/docs/extension-api/panels-and-settings",
        label: "Panels and settings",
        description: "Add consultative project UI and configuration backed by the Pi extension.",
      },
      {
        href: "/docs/extension-api/ui",
        label: "Shared UI",
        description: "Use NativePi-styled controls, semantic CSS variables, dialogs, menus, and fields.",
      },
      {
        href: "/docs/extension-api/examples",
        label: "Examples and recipes",
        description: "Copy focused patterns for live state, failures, tool lifecycle UI, settings, and desktop actions.",
      },
    ],
  },
  {
    title: "Extension reference",
    links: [
      {
        href: "/docs/extension-api/reference",
        label: "API reference",
        description: "Look up exports, renderer types, context fields, actions, protocol types, and limits.",
      },
      {
        href: "/docs/extension-api/migration",
        label: "Migrate from 0.x",
        description: "Move an experimental raw-channel renderer to the version 1 contract.",
      },
    ],
  },
] as const satisfies readonly DocsSection[];

export const docsLinks = docsSections.flatMap<DocsLink>((section) => section.links);
