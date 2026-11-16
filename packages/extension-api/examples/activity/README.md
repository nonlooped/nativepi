# Runtime activity

A small, account-free Pi extension that observes real tool events. `/activity`
and the terminal status work in Pi CLI. NativePi optionally adds a live widget.
Counts deliberately reset on runtime restart; this is not a second transcript.

From this folder run `bun install`. In Pi CLI use `pi -e ./extension.ts`.
In NativePi, trust/open this folder as a project; its manifest provides the
renderer. Add `extension.ts` through Pi's configured extension paths or install
this folder through Settings → Tools & extensions → Packages. Restart Pi after
changing either entry. Use a normal tool in a conversation, then `/activity`.
No model account is needed to load the UI or run the command; running an agent
uses your existing Pi provider.

The repository typecheck covers these sources. To distribute, replace the local
file dependency with a released compatible API version after maintainer release.
Do not publish this private example.
