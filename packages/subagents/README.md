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

`subagent_spawn` accepts an optional `model` as `provider/model` and an optional Pi `thinkingLevel`. If either is omitted, the parent chat's current value is used. The delegated prompt must be self-contained because the child cannot see the parent conversation.

## Configure

The default concurrency is 6. Set a user-level value in `~/.pi/agent/subagents.json`:

```json
{
  "maxConcurrency": 6
}
```

A trusted project can override it in `.pi/subagents.json`. Run `/reload` after editing either file manually. NativePi also exposes the user-level value under **Settings → General → Subagents**. Reducing the limit does not stop children that are already running; it delays queued work until the running count falls below the new limit.

Subagent conversations are ephemeral and do not appear in Pi session history.
