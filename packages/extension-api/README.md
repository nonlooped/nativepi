# @nativepi/extension-api

Build graphical surfaces for [NativePi](https://github.com/nonlooped/nativepi)
without changing how the same extension behaves in Pi's terminal interface.

A package can have two independent entries:

- `pi.extensions` is the ordinary Pi extension. Pi owns its tools, commands,
  events, state, and terminal UI.
- `nativepi.renderer` is optional browser code that renders the same capability
  in NativePi's controlled interface slots.

The two entries communicate through a typed, runtime-validated protocol. They
do not share process memory, and the renderer is never loaded by Pi's CLI.

## Install

When a renderer is purely visual, a development dependency is enough:

```sh
bun add -d @nativepi/extension-api
```

When the Pi half uses `@nativepi/extension-api/host` or imports a shared runtime
protocol, install it as a regular dependency:

```sh
bun add @nativepi/extension-api
```

React is an optional peer. NativePi supplies its own React instance at runtime,
so renderer builds must not bundle another copy.

## Package manifest

Keep the Pi and browser entries separate:

```json
{
  "pi": { "extensions": ["./src/extension.ts"] },
  "nativepi": { "renderer": "./src/renderer.tsx" }
}
```

NativePi discovers this manifest through Pi's configured packages, compiles the
renderer with esbuild, checks its API version and contribution shape, and mounts
each contribution behind an error boundary.

## Define one shared protocol

The protocol is the source of truth for calls from the renderer and events from
the Pi process. Its schemas run on both sides of the channel. The recommended
Zod instance comes from the API package: NativePi provides it to renderers, so
it is CSP-safe and is not bundled once per extension. Any synchronous object
with `parse(value)` and a JSON-compatible output also works.

```ts
// src/protocol.ts
import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const counterState = z.object({ count: z.number().int() });

export const counterProtocol = defineProtocol({
  methods: {
    state: { result: counterState },
    increment: {
      params: z.object({ by: z.number().int().positive() }),
      result: counterState,
    },
  },
  events: {
    changed: counterState,
    invalidated: undefined,
  },
});
```

Method parameters are omitted when a method takes no input. A parameter schema
whose output includes `undefined` makes the argument optional. Every method has
a result schema. Use `z.null()` for an action with no meaningful result.

An event maps directly to its payload schema. Use `undefined` for a payload-free
event. Values must remain JSON data: null, booleans, finite numbers, strings,
arrays, or plain objects containing those values.

The same schema validates a value on both sides of the process boundary. Keep
protocol schemas idempotent and shape-preserving; use them for validation and
defaults, not one-way transforms whose output would fail a second parse.

## Connect the Pi half

`connect` registers the entire method table at once. Registering the package
again replaces that table atomically, so extension reloads cannot retain a
removed handler.

```ts
// src/extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { counterProtocol } from "./protocol.ts";

export default function counterExtension(pi: ExtensionAPI) {
  let count = 0;

  const nativepi = connect("@acme/counter", counterProtocol, {
    state: () => ({ count }),
    increment: ({ by }) => {
      count += by;
      const state = { count };
      nativepi.emit("changed", state);
      return state;
    },
  });

  pi.registerCommand("counter", {
    description: "Show the current counter",
    handler: async (_args, context) => {
      context.ui.notify(`Count: ${count}`, "info");
    },
  });
}
```

The package name passed to `connect` must be the name of the manifest that owns
`nativepi.renderer`. Method names, arguments, results, event names, and payloads
are inferred from the protocol. Invalid runtime data throws at its source with
the method or event name in the error.

In Pi's terminal there is no NativePi host. Handlers are still type checked and
schema validation still works, but `connected` is false and valid `emit` calls
do nothing. Use Pi's own UI when `connected` is false; do not import renderer
runtime code from the Pi entry.

## Define the renderer

Write the API version as a literal. NativePi checks it before any contribution
function can run.

```tsx
// src/renderer.tsx
import { useEffect, useState } from "react";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import { Badge, Button } from "@nativepi/extension-api/ui";
import { counterProtocol } from "./protocol.ts";

function Counter({
  context,
}: {
  context: RendererContext<typeof counterProtocol>;
}) {
  const { call, on } = context.channel;
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    void call("state").then((state) => active && setCount(state.count));
    const off = on("changed", (state) => setCount(state.count));
    return () => {
      active = false;
      off();
    };
  }, [call, on]);

  return (
    <Button
      variant="ghost"
      onClick={() => void call("increment", { by: 1 }).then((state) => setCount(state.count))}
    >
      Count <Badge variant="secondary">{count}</Badge>
    </Button>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: counterProtocol,
  composerControls: [
    {
      id: "counter",
      render: (context) => <Counter context={context} />,
    },
  ],
});
```

`context.channel.call` validates parameters before IPC and validates the result
again when it returns. `context.channel.on` validates each event payload before
the listener runs. Both functions keep stable identities until the extension is
reloaded, so they are safe effect dependencies. Calls reject after 30 seconds or
when the user switches chats before the result returns.

## Contributions

All graphical surfaces are optional and controlled by NativePi:

- `tools` maps a Pi tool name to an inline renderer. It receives `call`, the
  optional `result` while a tool is running, and `context`.
- `entries` maps a Pi session-entry type to a renderer.
- `composerWidgets` places keyed content immediately above or below the
  composer. Keep it short; detailed content belongs in a panel or dialog.
- `composerControls` adds one compact control beside the model and thinking
  controls.
- `panels` adds a keyed, titled section to the project context pane.
- `settings` adds a keyed section to **Settings → General**. NativePi draws its
  heading and description; the extension renders only the controls.

Use a unique, stable `id` for every array contribution. NativePi rejects
duplicate IDs in a slot. The first configured extension with a renderer for a
given tool or entry type owns that renderer.

Graphical contributions do not replace the transcript, composer, navigation,
or agent loop. Pi commands, tools, providers, prompts, skills, sessions, and
configuration remain Pi capabilities and should be implemented through Pi.

## Renderer context

Every contribution receives the current view as read-only data:

```ts
context.extension // { id, name }
context.project   // { path, name }
context.session   // { file, name? }; file is null for a new chat
context.agent     // { status, running, model?, thinkingLevel }
context.channel   // typed call/on transport
context.actions   // safe NativePi renderer actions
```

The context object is rebuilt when visible state changes. Destructure stable
channel functions for effects, and read project/session/agent fields during
render.

`context.actions` provides operations that belong to the desktop surface:

- `notify(message, tone?)`
- `insertIntoComposer(text)` — edits the draft but never sends it
- `openExternal(url)` — http(s) only
- `openFile(file, { line?, column? })` — project-relative, preferred editor
- `revealFile(file)` — project-relative, platform file manager
- `copyText(text)`

Failures reject instead of silently succeeding. Handle them where the user can
act on the outcome.

## Native UI components

Import styled controls from `@nativepi/extension-api/ui`. NativePi currently
provides:

- `Button` and `Badge`
- `Input`, `Textarea`, `Label`, `Switch`, and `Separator`
- `Field`, `FieldContent`, `FieldDescription`, `FieldError`, `FieldGroup`, and
  `FieldLabel`
- `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`,
  `DialogFooter`, `DialogTitle`, and `DialogDescription`
- `Menu`, `MenuTrigger`, `MenuContent`, `MenuGroup`, `MenuLabel`, `MenuItem`, and
  `MenuSeparator`
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`,
  `SelectLabel`, `SelectItem`, and `SelectSeparator`
- `SettingsActionRow`, `SettingsSwitchRow`, `SettingsSelectRow`,
  `SettingsTextRow`, and `SettingsSliderRow`

Dialog and menu triggers use Base UI's `render` prop, not Radix's `asChild`:

```tsx
<Dialog>
  <DialogTrigger render={<Button variant="outline">Open details</Button>} />
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Details</DialogTitle>
      <DialogDescription>What this extension found.</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

Tailwind scans NativePi before an extension is compiled, so classes invented in
renderer source have no generated CSS. Prefer shared component variants and use
inline styles for extension-specific layout. Semantic CSS variables such as
`var(--foreground)`, `var(--muted-foreground)`, `var(--border)`,
`var(--destructive)`, `var(--warning)`, and `var(--success)` follow the active
NativePi surface.

Use Phosphor icons, matching NativePi's component preset. Icons inside a button
use `data-icon="inline-start"` or `data-icon="inline-end"`.

## Runtime and compatibility

Renderer code is trusted package code, not a sandbox. It runs in the window but
is limited to declared contribution slots. NativePi supplies React and the
extension API modules through its already-loaded host modules; other renderer
dependencies are bundled.

There are two versions with different jobs:

- `apiVersion: 1` is the renderer protocol contract and is checked at load time.
- exported `version` is the installed npm package version and is informational.

Do not set `apiVersion` from the exported constant in a renderer definition.
Writing the literal is what lets an older bundle identify itself to a newer
NativePi host. Package releases follow SemVer; a future incompatible renderer
shape receives a new API version.

## Migrating from the 0.x renderer API

The version-1 contract intentionally replaces the experimental raw channel:

- Add the literal `apiVersion: 1` to `defineRenderer`.
- Define one shared protocol and pass it to both `defineRenderer` and `connect`.
- Replace repeated `channel.method(name, handler)` calls with the handlers
  object passed to `connect(packageName, protocol, handlers)`.
- Rename `NativePiContext` to `RendererContext` and renderer prop `ctx` to
  `context`.
- Replace `ctx.call` and `ctx.on` with `context.channel.call` and
  `context.channel.on`.
- Rename contribution `key` fields to `id`.
- Read `context.project`, `context.session`, and `context.agent` instead of the
  old nullable session object. The removed `dark` flag was always true because
  NativePi is dark-only.
- Delete renderer-side response type guards that duplicate protocol schemas.

NativePi rejects an old renderer with a compatibility error instead of trying
to interpret it as version 1. The ordinary Pi extension continues to load even
when its optional graphical renderer is incompatible.

## License

MIT
