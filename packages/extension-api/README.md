# @nativepi/extension-api

Types and helpers for building graphical extensions for
[NativePi](https://github.com/nonlooped/nativepi), a desktop interface for the
Pi coding agent, for Windows, macOS, and Linux.

Normal Pi extensions run inside Pi, unchanged. This package is only needed when
an extension wants to contribute to the NativePi desktop surface.

> The graphical extension API is experimental and may change between releases.

## Install

```sh
bun add -d @nativepi/extension-api
```

React is a peer dependency. NativePi provides React at runtime so extension
components share NativePi's React instance, which means you do not bundle your
own copy.

## Usage

Add a `nativepi.renderer` entry to your Pi package manifest pointing at a
browser entry file, then default-export the result of `defineRenderer`.

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

- `tools` renders custom output for a named tool call.
- `entries` renders custom session entry types.
- `composerWidgets` adds UI above or below the composer.
- `panels` adds a context panel.

## License

MIT
