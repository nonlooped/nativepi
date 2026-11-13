# Upgrading from the retired packages

Pi now supplies MCP connections and the Meta provider directly. NativePi also
ships automatic chat titles, the `ask_user` tool, and a `/speed` command for
provider service tiers. These run through Pi's APIs; no optional package is
needed.

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

Use `/speed` to choose a tier for the current chat, or `/speed auto` to restore
the provider default. OpenAI Responses offers Standard, Priority, and Flex;
Codex offers Standard and Priority; Anthropic offers Automatic and Standard
only. The provider enforces model and account eligibility. A saved choice is
ignored on unsupported providers. Priority can increase costs or subscription
usage; Flex can be slower or temporarily unavailable.

Optional packages still available:

- [Subagents](../packages/subagents/README.md)
- [Tool batching guidance and statistics](../packages/throughput/README.md)
- [Subscription usage](../packages/subscription-usage/README.md)
- [Graphical extension API](../packages/extension-api/README.md)
