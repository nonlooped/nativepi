# Agent setup and subscription capacity

Settings → Agent setup uses the selected project context (or No project) to
show the effective skills and prompt templates resolved by Pi's resource loader.
Each entry includes its source, scope, file path and description. Loader errors
and collisions appear alongside the list. Extensions may discover additional
resources in a running chat; this static view does not execute third-party
extensions. Manage package-provided resources in Settings → Extensions.

Create a skill with a name, description and instructions, or create a prompt
with Markdown content and Pi's normal argument placeholders. NativePi writes
normal user `skills/<name>/SKILL.md` / `prompts/<name>.md` files in Pi's agent
directory, or their `.pi` project equivalents. It never overwrites existing
files. Open file uses the configured editor for subsequent edits or removal;
linked directories must be managed through the editor. Pi CLI interoperability
and the original configuration remain intact; there is no NativePi registry.

The MCP form adds or replaces a named HTTP or stdio server in normal `mcp.json`
through Pi's CLI. Arguments are entered one per line and passed without a shell.
Remove server removes the named entry from the selected scope after confirmation.
Project entries can override user entries. Advanced headers, environment settings
and OAuth options remain available in `mcp.json`, `pi mcp`, and `/mcp`.

Check servers and tools explicitly runs configured enabled server programs and
connects remote servers through `pi mcp list --json`. The report shows effective
source/scope, project overrides, enabled/connection state, exposure and tool names.
These check connections are closed afterward; they are separate from live chat
connections. Use `/mcp` in a Work chat for live health, full connection errors,
OAuth sign-in and tool exposure controls through NativePi's terminal UI bridge.
Project mutations require existing Pi trust. No operation silently grants trust.
Pi CLI reports project configuration it withholds under its own trust decision.
Changes affect new processes; restart project Pi when all turns are idle to
update existing chats. Chat mode does not automatically discover these resources.

## Provider quota coverage

Settings → Usage separates provider account limits from model-reported local
tokens and API-equivalent costs. Local costs are not subscription charges and
session tokens are never used to infer remaining account quota.

- **OpenAI Codex OAuth:** ChatGPT's `backend-api/wham/usage`, with the account
  selected by Pi's resolved token. Displays primary/secondary and additional
  named windows, used/remaining percentages, reset times, supplied plan type and credit balance/unlimited-credit metadata.
- **Anthropic OAuth:** `api.anthropic.com/api/oauth/usage` with the OAuth beta
  header. Displays supplied five-hour, weekly, Sonnet-weekly and Opus-weekly
  utilization and reset times. No plan tier is inferred.
- **Other connections:** explicitly unsupported. This includes Copilot, Gemini,
  Kimi and API-key accounts. NativePi does not inspect another client's tokens,
  exchange accounts, or assume a model API key can query subscription limits.

These account endpoints are provider-controlled and may be unavailable or rate
limited; Anthropic's endpoint is undocumented and particularly unreliable.
No compatibility guarantee is implied by coverage. Pi 1.5.2 has no exported
subscription quota API, so these two small backend adapters supplement it.
Authentication and token refresh still belong entirely to Pi's ModelRuntime.
Credentials and raw provider responses never cross IPC or enter NativePi state.
Requests use fixed HTTPS destinations, refuse redirects and time out in ten
seconds. The backend coalesces concurrent reads and enforces a one-minute
minimum refresh interval (extended for supplied Retry-After headers); it does not poll automatically. A credential change
invalidates the previous cache. Errors retain the last successful windows with
a stale label, and successful data is marked stale after five minutes. Reset
times use the device's local timezone. An absent window is unavailable, not zero.

The adapter contracts were checked against the installed Pi 1.5.2 source,
[OpenAI's backend client](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client.rs),
and [Anthropic's usage endpoint issue](https://github.com/anthropics/claude-code/issues/31637).
The requested [T3 usage guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/usage.md)
and [Harnss](https://github.com/OpenSource03/harnss#readme) informed workflow review;
their authentication implementations are not used.
