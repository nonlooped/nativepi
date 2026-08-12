# @nativepi/throughput

A small Pi extension that reduces avoidable model round-trips. Pi already runs sibling tool calls concurrently; this package adds concise system-prompt guidance that makes the model emit independent reads, searches, edits, commands, MCP calls, questions, and delegated work together.

It does not reorder calls or guess whether operations are independent. The model retains that decision, and dependent or destructive operations remain separate.

## Install

```sh
pi install @nativepi/throughput
```

Run `/throughput` in a session to see its calls-per-response and single-call-response rate. Higher calls per response and a lower single-call rate indicate fewer model round-trips; compare sessions doing similar work rather than unrelated tasks.
