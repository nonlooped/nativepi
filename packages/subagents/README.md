# @nativepi/subagents

A Pi package for running isolated Pi subagents asynchronously. Children start with a fresh conversation, while retaining the current project, Pi configuration, context files, skills, tools, and extensions. Subagent tools are disabled inside children, so delegation cannot recurse.

## Install

```sh
pi install @nativepi/subagents
```

## Tools

- `subagent_spawn` queues a child and returns its id immediately.
- `subagent_status` returns one child's current state and final response when available.
- `subagent_list` lists all children in the current parent session.
- `subagent_wait` waits for selected children and returns their final responses.
- `subagent_cancel` cancels queued or running children.

`subagent_spawn` accepts an optional `model` as a model ID or `provider/model`; an unqualified ID must be unique in the available catalog. It also accepts an optional Pi `thinkingLevel`. If either is omitted, the parent chat's current value is used. The delegated prompt must be self-contained because the child cannot see the parent conversation.

## NativePi interface

NativePi adds a **Subagents** entry to the conversation header. It opens a full-size workspace for every child in the current chat, including queued, running, completed, failed, and cancelled work. Select a child to read its complete conversation with Pi—messages, reasoning, tool calls and results, errors, and final response—as it happens. Queued or running children can also be cancelled from the conversation header.

## Terminal TUI

Inside Pi's terminal you can control subagents without relying on the model. `/subagents` replaces the composer with a compact control panel, so it does not cover the conversation in a modal.

- `↑` / `↓` — select a subagent
- `Enter` — open its task, status, recent activity, and final-response preview
- `N` — enter a task and start a child using the chat's model and thinking level
- `X` — stop the selected child after confirmation
- `L` — change the user concurrency limit
- `Tab` — switch between All, Active, Queued, and Done
- `Esc` — go back or close the panel

For advanced spawning or scripting, use commands directly:

- `/subagents list`
- `/subagents spawn <prompt> [--name LABEL] [--model provider/id] [--thinking LEVEL]`
- `/subagents status <id>`
- `/subagents cancel <id> [id ...]`
- `/subagents concurrency <n>`
- `/subagent` is an alias for `/subagents`

The panel updates live and shows status, duration, model, token count, tool count, and whether concurrency comes from the user default or a project override.

## Configure

The default concurrency is 6, and `maxConcurrency` must be an integer from 1 through 32. Set a user-level value in `~/.pi/agent/subagents.json`:

```json
{
  "maxConcurrency": 6
}
```

A trusted project can override it in `.pi/subagents.json`. Run `/reload` after editing either file manually. NativePi also exposes the user-level value under **Settings → General → Subagents**. Reducing the limit does not stop children that are already running; it delays queued work until the running count falls below the new limit.

Subagent conversations are ephemeral and do not appear in Pi session history.
