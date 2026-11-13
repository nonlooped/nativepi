# @nativepi/chat-mode

A conversational Pi profile for questions, research, explanations, and drafts. It disables Pi's built-in edit/write tools and enables read-only exploration tools, while preserving tools from explicitly loaded extensions. Shell access remains available for diagnostics; instructions against mutations are guidance, not a sandbox.

NativePi loads this profile automatically in Chat. To use the same profile in Pi's CLI from a neutral working directory:

```sh
pi --no-extensions --no-context-files --no-skills --no-prompt-templates -e /path/to/chat-mode/extensions/index.ts
```

Add further `-e` paths to opt into whole extensions. Without the isolation flags, loading this extension still supplies the conversational instructions but retains your normal Pi resources.

The package can be installed through Pi with `pi install npm:@nativepi/chat-mode` once published. A global installation applies the profile to every run where the extension is enabled; prefer explicit loading when mixing conversation and project work.
