# Upgrading from the retired packages

Pi now supplies MCP connections and the Meta provider directly. NativePi also
ships automatic chat titles, the `ask_user` tool, and service-tier controls in
the composer model picker. The `/speed` command remains available. These run
through Pi's APIs; no optional package is needed.

Existing npm installations of the retired packages are ignored inside NativePi
to prevent duplicate tools, requests, and providers. Pi CLI configuration is
left unchanged.

Remove `@nativepi/mcp`, `@nativepi/meta`, `@nativepi/title-generator`,
`@nativepi/ask-user`, and `@nativepi/service-tier`:

```sh
pi remove npm:@nativepi/mcp
pi remove npm:@nativepi/meta
pi remove npm:@nativepi/title-generator
pi remove npm:@nativepi/ask-user
pi remove npm:@nativepi/service-tier
```

Add `--local` for project installations. Then:

- Reload or restart existing chats.
- Remove any `-builtin:mcp` exclusion from Pi settings so Pi can connect servers.
- Leave existing `mcp.json` files and session names as they are.
- Change `MODEL_API_KEY` to `META_API_KEY` for Meta API-key authentication.
- Treat saved Standard/Fast session choices as Standard/Priority. The old title
  model picker is gone; new chats use the current model.

Configure MCP with `pi mcp` or `mcp.json`, and inspect it with `/mcp`. Meta uses
`META_API_KEY` or Pi's Meta sign-in.

Open the composer model picker and use **Speed** beside reasoning to choose a tier
for the current chat. Choose **Standard** or **Priority**. New chats and older
Automatic or Flex selections use Standard. OpenAI and Codex receive the matching
explicit service tier. For Anthropic, Standard uses standard-only capacity;
Priority allows reserved Priority capacity when available, with the provider's
standard-capacity fallback. The provider enforces model and account eligibility.
A saved choice is ignored on unsupported providers. Priority can increase costs
or subscription usage.

Chat mode and Exa web access are now built into NativePi, together with inline
HTML artifacts. No package installation is needed. Restart existing Pi processes
to load the built-in tools. HTML artifacts are saved with the Pi conversation and
work in both Chat and Work.

The NativePi subagents, subscription-usage, and throughput packages have been
removed. Subscription-limit settings are gone; local cost and token usage remains.
Existing installations of all five packages are ignored in NativePi. Remove them
from Pi's configuration with its package manager (add `--local` for project scope):

```sh
pi remove npm:@nativepi/chat-mode
pi remove npm:@nativepi/web-access
pi remove npm:@nativepi/subagents
pi remove npm:@nativepi/subscription-usage
pi remove npm:@nativepi/throughput
```

Third-party Pi extensions and the [graphical extension API](../packages/extension-api/README.md)
remain supported. Your Pi CLI configuration is not modified by NativePi.
