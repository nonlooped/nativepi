/**
 * The four layers of the NativePi window, ordered back to front exactly as they
 * are ordered in the running application.
 *
 * Every claim here is from README.md, apps/desktop/PRODUCT.md, or source. The
 * `depth` values are the Z offsets, in pixels, at full separation.
 */
export type Layer = {
  id: string;
  name: string;
  owner: string;
  depth: number;
  heading: string;
  body: string;
  facts: string[];
};

export const layers: Layer[] = [
  {
    id: "pi",
    name: "Pi process",
    owner: "Pi owns this",
    depth: -460,
    heading: "Pi keeps the agent loop.",
    body: "A pinned build of Pi is bundled with the app and started in RPC mode. It owns the loop, the providers, authentication, tools, prompts, skills, extensions, queues, compaction, and sessions. NativePi never makes a model request of its own.",
    facts: [
      "Sessions live in Pi's own storage, in ~/.pi/agent",
      "Credentials are Pi's, never held in NativePi",
      "The Pi CLI reads and writes the same files",
    ],
  },
  {
    id: "host",
    name: "Electron main",
    owner: "The host",
    depth: -230,
    heading: "One process per project, and a narrow bridge.",
    body: "The Electron main process talks to Pi over JSON RPC on stdin and stdout, and exposes a constrained contextBridge to the window. Nothing else crosses. Different projects can run at the same time; a project never gets two Pi processes.",
    facts: [
      "JSON RPC over stdin and stdout",
      "A constrained contextBridge, not full Node access",
      "Optional token-protected local server for browser access",
    ],
  },
  {
    id: "renderer",
    name: "React renderer",
    owner: "What you touch",
    depth: 0,
    heading: "The part you actually work in.",
    body: "Projects, sessions, streamed responses, thinking, tool calls, file changes, and Git diffs, in one window. React 19 with the React Compiler, Tailwind, and shadcn/ui. It renders what Pi returns and adds no agent behavior of its own.",
    facts: [
      "Resizable three-pane workspace",
      "Rich diffs and Git status beside the transcript",
      "Integrated terminals, scoped per project",
    ],
  },
  {
    id: "slots",
    name: "Extension slots",
    owner: "This part is yours",
    depth: 210,
    heading: "The app itself is hackable.",
    body: "Normal Pi extensions run inside Pi, unchanged. An extension that wants the desktop surface imports @nativepi/extension-api and adds a nativepi.renderer entry. NativePi compiles it with esbuild and mounts its contributions behind error boundaries.",
    facts: [
      "Four contribution points, no core replacement",
      "Your components share NativePi's React instance",
      "Install at user or project scope",
    ],
  },
];

/**
 * The four real contribution points, from packages/extension-api/src/index.ts.
 *
 * `x` and `y` are percentages of the window screenshot, and each one sits over
 * the region of the real interface that slot contributes to: the transcript for
 * tools and entries, the composer for widgets, the context pane for panels.
 */
export const slots = [
  {
    key: "tools",
    label: "Tool renderer",
    type: "tools?: Record<string, ToolRenderer>",
    blurb: "Draw a tool call and its result your own way.",
    x: 37,
    y: 58,
  },
  {
    key: "entries",
    label: "Entry renderer",
    type: "entries?: Record<string, EntryRenderer>",
    blurb: "Render a custom session entry in the transcript.",
    x: 63,
    y: 46,
  },
  {
    key: "composerWidgets",
    label: "Composer widget",
    type: "composerWidgets?: ComposerWidget[]",
    blurb: "Sit directly above or below the composer.",
    x: 49,
    y: 72,
  },
  {
    key: "panels",
    label: "Context panel",
    type: "panels?: Panel[]",
    blurb: "Add a titled panel to the context pane.",
    x: 88,
    y: 45,
  },
] as const;
