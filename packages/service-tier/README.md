# @nativepi/service-tier

A Pi package that adds Standard and Fast response-speed choices for supported OpenAI models. It works in Pi's terminal and, when installed in NativePi, adds the same control to the composer.

## Install

```sh
pi install npm:@nativepi/service-tier
```

Use `/speed standard` or `/speed fast` in Pi. Fast is offered on the `openai` and legacy `openai-codex` providers for GPT-6.1 Sol, GPT-6 Astra, GPT-6 Sol, GPT-6 Luna, and supported GPT-5.4–5.6 models. It uses priority processing, which may increase subscription usage or API costs. The choice is recorded in the Pi session, so NativePi and the terminal use the same speed.
