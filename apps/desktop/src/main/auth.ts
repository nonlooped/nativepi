import { shell } from "electron";
import {
  getAgentDir,
  hasTrustRequiringProjectResources,
  ModelRuntime,
  ProjectTrustStore,
  VERSION as PI_VERSION,
} from "@earendil-works/pi-coding-agent";
import { isProjectTrusted } from "./pi/services.ts";
import type { AuthNotice, AuthProviderInfo, AuthPromptRequest } from "../shared/rpc-schema.ts";
import { shapeProviders } from "../shared/providerShape.ts";

/**
 * Provider authentication and project trust are driven through Pi's exported
 * APIs. RPC has no auth commands, so NativePi owns login/logout orchestration
 * over a single in-process ModelRuntime that reads and writes the normal
 * `~/.pi/agent` files. Credentials are only ever stored where Pi stores them;
 * nothing here touches NativePi's own state file.
 */

export const PI_VERSION_STRING: string = PI_VERSION;

let runtimePromise: Promise<ModelRuntime> | undefined;
function getRuntime(): Promise<ModelRuntime> {
  if (!runtimePromise) runtimePromise = ModelRuntime.create({ allowModelNetwork: true });
  return runtimePromise;
}

export async function listProviders(): Promise<AuthProviderInfo[]> {
  const runtime = await getRuntime();
  return shapeProviders(runtime);
}

type Interaction = Parameters<ModelRuntime["login"]>[2];
type AuthPrompt = Parameters<Interaction["prompt"]>[0];
type AuthEvent = Parameters<Interaction["notify"]>[0];

export interface AuthPush {
  prompt: (id: string, request: AuthPromptRequest) => void;
  notice: (notice: AuthNotice) => void;
}

let promptSeq = 1;
const pending = new Map<string, (r: { value?: string; cancel?: boolean }) => void>();

export function respondPrompt(id: string, result: { value?: string; cancel?: boolean }): void {
  const resolve = pending.get(id);
  if (resolve) {
    pending.delete(id);
    resolve(result);
  }
}

function cancelPending(): void {
  for (const resolve of pending.values()) resolve({ cancel: true });
  pending.clear();
}

export async function login(providerId: string, type: "api_key" | "oauth", push: AuthPush): Promise<void> {
  const runtime = await getRuntime();
  cancelPending();

  const interaction: Interaction = {
    prompt: (prompt: AuthPrompt) =>
      new Promise<string>((resolve, reject) => {
        const id = `auth-${promptSeq++}`;
        pending.set(id, ({ value, cancel }) => {
          if (cancel || value === undefined) reject(new Error("Login cancelled"));
          else resolve(value);
        });
        push.prompt(id, toPromptRequest(prompt));
      }),
    notify: (event: AuthEvent) => {
      const notice = toNotice(event);
      push.notice(notice);
      const url =
        notice.kind === "auth_url" ? notice.url : notice.kind === "device_code" ? notice.verificationUri : undefined;
      if (url) {
        void shell.openExternal(url);
      }
    },
  };

  try {
    await runtime.login(providerId, type, interaction);
  } finally {
    cancelPending();
  }
}

export async function logout(providerId: string): Promise<void> {
  const runtime = await getRuntime();
  await runtime.logout(providerId);
}

function toPromptRequest(prompt: AuthPrompt): AuthPromptRequest {
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

function toNotice(event: AuthEvent): AuthNotice {
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


/**
 * A project needs a trust decision when it carries trust-requiring local
 * resources (`.pi` extensions, `.agents/skills`). Pi's RPC mode runs untrusted
 * by default, so NativePi surfaces the prompt and records the decision in Pi's
 * trust store; the Pi process then honors it on start.
 */
export function checkTrust(projectDir: string): { required: boolean; trusted: boolean } {
  try {
    return { required: hasTrustRequiringProjectResources(projectDir), trusted: isProjectTrusted(projectDir) };
  } catch {
    // Fail open: without a decision Pi still runs untrusted, so never block.
    return { required: false, trusted: false };
  }
}

export function setTrust(projectDir: string, trusted: boolean): void {
  new ProjectTrustStore(getAgentDir()).set(projectDir, trusted);
}
