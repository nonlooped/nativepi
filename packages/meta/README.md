# @nativepi/meta

A Pi package that adds Meta as a provider for Muse Spark models via the Meta Model API. It works in Pi's terminal and in NativePi.

## Install

```sh
pi install @nativepi/meta
```

Set your Model API key:

```sh
export MODEL_API_KEY=your-key  # from https://dev.meta.ai
```

Then select a Muse Spark model in Pi (`/model`) or in NativePi's model picker. The provider appears as **Meta** with models `muse-spark-1.1`, `muse-spark-1.2`, and `muse-spark-1.2-contributor`.

## Models

All three models accept text and image input.

- `muse-spark-1.1` — Muse Spark 1.1, 1,000,000 context / 32,000 max output, reasoning with encrypted-content replay
- `muse-spark-1.2` — Muse Spark 1.2, 1,048,576 context / 131,072 max output
- `muse-spark-1.2-contributor` — Muse Spark 1.2 Contributor, same context/output as 1.2 at contributor pricing

All use the OpenAI Responses API at `https://api.meta.ai/v1` with `MODEL_API_KEY` for authentication. Standard pricing is $1.25 / 1M input and $4.25 / 1M output (cache read $0.15); contributor is $0.10 / $0.20, as reported by Meta / `https://api.meta.ai/v1` catalog.

## Details

- Provider id: `meta`, display name `Meta`
- Base URL: `https://api.meta.ai/v1`
- Auth: `MODEL_API_KEY` (exposed as `$MODEL_API_KEY`); Pi's `/login` and NativePi's provider settings work once the key is set
- API: `openai-responses` — reasoning is preserved across turns via `reasoning.encrypted_content`, which keeps the agent's prior thinking during tool loops
- Thinking levels: `minimal`, `low`, `medium`, `high`, `xhigh` (and `max` as `xhigh`); `off` maps to `high` because Muse Spark always reasons and the `before_provider_request` hook always adds `reasoning.encrypted_content` for continuity

NativePi shows the provider automatically; no extra renderer is required. The extension only registers the provider with Pi.
