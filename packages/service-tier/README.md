# @nativepi/service-tier

A Pi package that adds Standard and Fast response-speed choices for supported Codex models. It works in Pi's terminal and, when installed in NativePi, adds the same control to the composer.

## Install

```sh
pi install @nativepi/service-tier
```

Use `/speed standard` or `/speed fast` in Pi. Fast is offered for the `openai-codex` models `gpt-5.4`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, and `gpt-5.6-terra`. The choice is recorded in the Pi session, so NativePi and the terminal use the same speed.
