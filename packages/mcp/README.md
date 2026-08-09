# @nativepi/mcp

A Pi package that connects Model Context Protocol servers and exposes their tools to the model. It uses the official `@modelcontextprotocol/sdk` client and works in Pi and NativePi.

## Install

```sh
pi install @nativepi/mcp
```

## Configure

Create `~/.pi/agent/mcp.json` for user-level servers:

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

A trusted project can add or override servers by name in `.pi/mcp.json`. Project entries take precedence over user entries. Relative `cwd` values are resolved from the directory containing the configuration file.

The extension supports stdio and Streamable HTTP servers. Run `/reload` after changing configuration. Server tools are registered as `mcp_<server>_<tool>` names so tools from different servers cannot collide.

Only MCP tools are exposed. MCP resources and prompts are not loaded.
