# @nativepi/meta

A Pi package that adds Meta as a provider for Muse Spark models via the Meta Model API. It works in Pi's terminal and in NativePi.

## Install

```sh
pi install npm:@nativepi/meta
```

Set your Model API key:

macOS and Linux:

```sh
export MODEL_API_KEY=your-key  # from https://dev.meta.ai
```

PowerShell on Windows:

```powershell
$env:MODEL_API_KEY = "your-key"
```

An environment variable must be available to the process starting Pi or NativePi. If you set it after the app is running, restart the app from that environment.

Then select a Muse Spark model in Pi (`/model`) or in NativePi's model picker. The provider appears as **Meta** with `muse-spark-1.3` as the recommended model.

## Models

All models accept text and image input in Pi. Each has a 1,048,576-token context window and 131,072-token max output.

- `muse-spark-1.3` — this package's recommended model for agentic and coding work
- `muse-spark-1.3-contributor` — discounted 1.3 tier; prompts and completions may train future Meta models
- `muse-spark-1.2` / `muse-spark-1.2-contributor` — previous standard and contributor models
- `muse-spark-1.1` — original standard model

All use the OpenAI Responses API at `https://api.meta.ai/v1` with `MODEL_API_KEY` for authentication. The extension's configured cost estimates are $1.25 / 1M input and $4.25 / 1M output (cache read $0.15) for standard models, and $0.10 / $0.20 (cache read $0.002) for contributor models. Check Meta's [model catalog](https://dev.meta.ai/docs/models/) and [pricing](https://dev.meta.ai/docs/pricing-rate-limits/) for current availability and billing; Pi's local cost totals use the registered estimates.

## Details

- Provider id: `meta`, display name `Meta`
- Base URL: `https://api.meta.ai/v1`
- Auth: `MODEL_API_KEY` (exposed to Pi as `$MODEL_API_KEY`); this is API-key authentication, not a Meta OAuth sign-in
- API: `openai-responses` — reasoning is preserved across turns via `reasoning.encrypted_content`, which keeps the agent's prior thinking during tool loops
- Thinking levels: `minimal`, `low`, `medium`, `high`, `xhigh` (and `max` as `xhigh`); `off` maps to `high` because Muse Spark always reasons and the `before_provider_request` hook always adds `reasoning.encrypted_content` for continuity

NativePi shows the provider automatically; no extra renderer is required. The extension only registers the provider with Pi.
