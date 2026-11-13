# @nativepi/web-access

Keyless Exa web search and page reading for Pi. NativePi loads these tools in both Chat and Work. They use Exa's anonymous hosted MCP service directly, without a NativePi server, search account, API key, or paid fallback.

- `nativepi_web_search`: returns current web results with source URLs.
- `nativepi_web_read`: reads an HTTP(S) page.

HTTP 429 responses honor `Retry-After`; tool-level quota errors get a one-minute cooldown. A warning appears in Pi's UI and the tool result explains the interruption. The extension does not retry automatically. Other conversation features remain usable. Anonymous service availability and quotas are controlled by Exa.

Requests have a 30-second deadline, support cancellation, validate MCP responses, and bound response size. Search queries and page URLs go to Exa. Retrieved pages are untrusted source material.

Load directly with `pi -e /path/to/web-access/extensions/index.ts`, or install with `pi install npm:@nativepi/web-access` once published. Tool names are prefixed to coexist with other web extensions.
