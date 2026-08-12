# @nativepi/ask-user

A Pi package that gives the agent an `ask_user` tool for resolving important ambiguity with a focused question. It has a dedicated graphical dialog in NativePi and a keyboard-driven interface in Pi's terminal.

Every question must offer at least two options and mark at least one as recommended. Recommendations remain advice only: you can choose any option, write your own answer without leaving the question, or cancel.

## Install

```sh
pi install @nativepi/ask-user
```

Pi loads the tool automatically. No configuration is required.

## Tool input

```json
{
  "question": "Which implementation should I use?",
  "options": [
    {
      "label": "Use the existing library",
      "description": "Smaller and easier to maintain",
      "recommended": true
    },
    {
      "label": "Build a custom implementation",
      "description": "More control, but more maintenance",
      "recommended": false
    }
  ]
}
```

The tool waits for your choice or written answer and returns it to the agent. Cancelling is reported explicitly rather than treated as a selection. In non-interactive print and JSON modes, the tool reports that interaction is unavailable instead of guessing.
