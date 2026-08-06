# @nativepi/subscription-usage

A Pi package that reads subscription limits reported by supported providers. It works in Pi's terminal and, when installed in NativePi, adds an at-a-glance usage control to the composer.

## Install

```sh
pi install @nativepi/subscription-usage
```

Use `/usage` in Pi to refresh and display the active provider's limits. NativePi reads the same data when you open the composer control. The package supports Anthropic, GitHub Copilot, Kimi Code, and OpenAI Codex subscriptions authenticated through Pi.
