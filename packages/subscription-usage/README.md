# @nativepi/subscription-usage

A Pi package that reads subscription limits reported by supported providers. In Pi's terminal, `/usage` displays the active provider's limits. When installed in NativePi, limits appear under **Settings → Usage → Subscription limits**.

## Install

```sh
pi install npm:@nativepi/subscription-usage
```

Use `/usage` in Pi to refresh and display the active provider's limits. NativePi reads limits for supported authenticated providers when you open **Settings → Usage → Subscription limits**. Open a project first so Pi can load the package and credentials. The package supports Anthropic, GitHub Copilot, Kimi Code, and legacy OpenAI Codex subscriptions authenticated through Pi. These are provider-reported quotas, not the local token and cost totals in **Local usage**.

Pi 1.1's newer **Sign in with ChatGPT** option on the `openai` provider authenticates against the OpenAI API. This package reads ChatGPT usage using the separate legacy `openai-codex` sign-in; it does not send the newer OpenAI token to ChatGPT's usage endpoint. API-key accounts do not expose subscription limits.
