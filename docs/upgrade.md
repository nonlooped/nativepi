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

Optional packages still available:

- [Subagents](../packages/subagents/README.md)
- [Tool batching guidance and statistics](../packages/throughput/README.md)
- [Subscription usage](../packages/subscription-usage/README.md)
- [Graphical extension API](../packages/extension-api/README.md)
