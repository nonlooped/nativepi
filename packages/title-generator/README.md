# @nativepi/title-generator

A Pi package that names a chat from its first request. It works in the Pi terminal and, when installed in NativePi, adds its model picker to **Settings → Extensions**.

## Install

```sh
pi install npm:@nativepi/title-generator
```

By default, title generation uses the chat's active model. Run `/title-model` in Pi to choose another available model there. In NativePi, select the model from **Settings → Extensions → Chat titles**. The choice is recorded in the Pi session, so the terminal and the desktop window use the same model for that chat. Requests use Pi's model registry and authentication, including provider hooks.
