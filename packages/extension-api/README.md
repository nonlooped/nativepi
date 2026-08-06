# @nativepi/extension-api

Types and helpers for building graphical extensions for
[NativePi](https://github.com/nonlooped/nativepi), a desktop interface for the
Pi coding agent on Windows, macOS, and Linux.

Normal Pi extensions run inside Pi, unchanged. This package is only needed when
an extension wants to contribute to the NativePi desktop surface.

> The graphical extension API is experimental and may change between releases.

## Install

```sh
bun add -d @nativepi/extension-api
```

A dev dependency is enough for the renderer half. NativePi rewrites the import
while compiling your entry, so the package is never resolved at runtime.

The channel described below is different. `@nativepi/extension-api/host` is
imported by the half that runs inside Pi, which loads it from your published
package like any other import, and dev dependencies are not installed for it. If
you use `connect`, install the package as a regular dependency instead:

```sh
bun add @nativepi/extension-api
```

React is a peer dependency. NativePi provides React at runtime so extension
components share NativePi's React instance, which means you do not bundle your
own copy.

## Usage

Add a `nativepi.renderer` entry to your Pi package manifest pointing at a
browser entry file, then default-export the result of `defineRenderer`. Keep
Pi's entry separate if the package also uses the host channel:

```json
{
  "pi": { "extensions": ["./src/extension.ts"] },
  "nativepi": { "renderer": "./src/renderer.tsx" }
}
```

```tsx
import { defineRenderer } from "@nativepi/extension-api";

export default defineRenderer({
  tools: {
    "my-tool": ({ call, result, ctx }) => (
      <div>
        {call.name} ran in {ctx.session?.projectDir ?? "no project"}
        {result?.isError ? " and failed" : null}
      </div>
    ),
  },
  panels: [
    {
      key: "my-panel",
      title: "My Panel",
      render: (ctx) => <div>{ctx.dark ? "dark" : "light"}</div>,
    },
  ],
});
```

NativePi compiles the entry with esbuild and loads each contribution behind an
error boundary. Extensions contribute to controlled slots only; they cannot
replace the core composer, transcript, sidebar, or routing.

## Contributions

- `tools` maps a Pi tool name to its inline result renderer. It receives the
  call, an optional result while the call is still running, and context.
- `entries` maps a session-entry type to its renderer.
- `composerWidgets` adds a keyed widget immediately above or below the composer.
- `composerControls` adds a keyed, compact control to the composer row beside
  NativePi's model and thinking controls.
- `settings` adds a keyed section to **Settings → General**. NativePi renders
  the section heading and description; the renderer supplies its controls.
- `panels` adds a keyed, titled panel to the context pane.

NativePi's stylesheet is built before an extension is compiled, so extension
Tailwind classes have no styles to apply. Import shared components from
`@nativepi/extension-api/ui` instead. It provides `Button`; `Dialog` with
`DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`,
`DialogFooter`, `DialogTitle`, and `DialogDescription`; `Menu` with
`MenuTrigger`, `MenuContent`, `MenuGroup`, `MenuLabel`, `MenuItem`, and
`MenuSeparator`; and `SettingsActionRow` for a labelled setting control.

The triggers use Base UI's `render` prop to compose another element; they do
not support Radix's `asChild` prop:

```tsx
<Dialog>
  <DialogTrigger render={<Button variant="outline">Open details</Button>} />
  <DialogContent>{/* DialogTitle, DialogDescription, and content */}</DialogContent>
</Dialog>
```

```tsx
import { Button, SettingsActionRow } from "@nativepi/extension-api/ui";

export default defineRenderer({
  settings: [{
    key: "example",
    heading: "Example",
    render: () => (
      <SettingsActionRow label="Option" description="What this changes.">
        <Button variant="outline">Choose</Button>
      </SettingsActionRow>
    ),
  }],
});
```

## Talking to your extension

The renderer runs in the window, while the rest of your extension runs inside
Pi. `@nativepi/extension-api/host` connects the two. Call `connect` with your
package name, register methods, and emit events:

```ts
import { connect } from "@nativepi/extension-api/host";

export default function (pi) {
  const ui = connect("@acme/my-extension");

  ui.method("stats", async () => ({ runs: await countRuns() }));
  pi.on("turn_end", () => ui.emit("changed"));
}
```

The renderer half reaches those through the `call` and `on` fields on every
`NativePiContext`:

```tsx
function Stats({ ctx }) {
  const { call, on } = ctx;
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => call("stats").then(setStats);
    load();
    return on("changed", load);
  }, [call, on]);

  return <div>{stats ? `${stats.runs} runs` : "Loading"}</div>;
}
```

`call` and `on` keep the same identity for as long as the window is open, so an
effect that depends on them runs once. The context object around them is rebuilt
on every render, so depend on the two functions rather than on `ctx`.

Both names have to match: `connect` takes the package name NativePi read the
`nativepi.renderer` key from, because that is how the two halves find each
other. `method` replaces a handler with the same name and `emit` notifies every
current listener for its event. Method results and event payloads cross as the
exported `JsonValue` type: null, booleans, numbers, strings, arrays, or objects
containing those values. A call fails if no method of that name is registered,
if the handler throws, or if it takes longer than thirty seconds.

Under Pi in a terminal there is no window to connect to, so every call on the
channel does nothing and `connected` is false. Pi reads its own `pi.extensions`
manifest key and never sees `nativepi.renderer`, so the renderer entry is not
loaded there at all. Your extension keeps working, without its graphical half.

That only holds if the two halves stay separate files. The renderer entry
imports React, which NativePi supplies at runtime and which Pi has no reason to
have, so importing your renderer from your Pi entry breaks the extension in the
terminal. Share types between them freely, since those are erased, but not
runtime code.

`connected` is the seam if you want one package to be good in both. Register
pi-tui widgets and dialogs through Pi's own UI context when it is false, and
rely on your graphical slots when it is true.

## License

MIT
