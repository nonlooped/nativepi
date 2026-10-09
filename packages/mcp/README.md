# @nativepi/mcp

A Pi package that connects Model Context Protocol servers and exposes their tools to the model. It uses the official `@modelcontextprotocol/sdk` client and works in Pi and NativePi.

Pi 1.1 includes [built-in MCP support](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/mcp.md), including OAuth, resources, prompts, and tool search. Use that by default; installing this package is only needed for its existing NativePi graphical server editor. This optional package exposes tools directly and does not support MCP OAuth, resources, or prompts.

If you use this package, disable `builtin:mcp` in Pi's configuration first. Both read the same `mcp.json` files, so leaving both enabled connects each server twice and exposes duplicate tools. Disabling the built-in extension is a Pi setting shared by the terminal and NativePi.

## Install

```sh
pi install @nativepi/mcp
```

## Configure

In NativePi, open **Settings → Extensions → MCP servers** to add, edit, or remove servers. Changes reconnect the active chat immediately; other open chats pick them up when Pi reloads.

You can also create `~/.pi/agent/mcp.json` for user-level servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"],
      "env": {
        "EXAMPLE_TOKEN": "value"
      }
    },
    "remote": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

A trusted project can add or override servers by name in `.pi/mcp.json`. Project entries take precedence over user entries. Relative `cwd` values are resolved from the directory containing the configuration file. NativePi preserves compatible changes made directly to either file.

The extension supports stdio and Streamable HTTP servers. Run `/reload` after changing configuration. Server tools receive sanitized names prefixed with `mcp_<server>_`; names are limited to 64 characters and receive a hash suffix when truncation or collisions require it.

Only MCP tools are exposed. MCP resources and prompts are not loaded.
