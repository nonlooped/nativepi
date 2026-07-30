import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AuthNotice, AuthPromptRequest } from "./rpc-schema.ts";

type Interaction = Parameters<ModelRuntime["login"]>[2];
type AuthPrompt = Parameters<Interaction["prompt"]>[0];
type AuthEvent = Parameters<Interaction["notify"]>[0];

export function toPromptRequest(prompt: AuthPrompt): AuthPromptRequest {
  switch (prompt.type) {
    case "select":
      return {
        kind: "select",
        message: prompt.message,
        options: prompt.options.map((o) => ({ id: o.id, label: o.label, description: o.description })),
      };
    case "manual_code":
      return { kind: "manual_code", message: prompt.message, placeholder: prompt.placeholder };
    case "secret":
      return { kind: "secret", message: prompt.message, placeholder: prompt.placeholder };
    default:
      return { kind: "text", message: prompt.message, placeholder: prompt.placeholder };
  }
}

export function toNotice(event: AuthEvent): AuthNotice {
  switch (event.type) {
    case "auth_url":
      return { kind: "auth_url", url: event.url, instructions: event.instructions };
    case "device_code":
      return {
        kind: "device_code",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        intervalSeconds: event.intervalSeconds,
        expiresInSeconds: event.expiresInSeconds,
      };
    case "progress":
      return { kind: "progress", message: event.message };
    default:
      return { kind: "info", message: event.message, links: event.links?.map((l) => ({ url: l.url, label: l.label })) };
  }
}
