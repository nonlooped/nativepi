import { shell } from "electron";
import {
  getAgentDir,
  hasTrustRequiringProjectResources,
  ModelRuntime,
  ProjectTrustStore,
  readStoredCredential,
  VERSION as PI_VERSION,
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { isProjectTrusted } from "./pi/services.ts";
import type { AuthNotice, AuthProviderInfo, AuthPromptRequest } from "../shared/rpc-schema.ts";
import { toNotice, toPromptRequest } from "../shared/providerAuth.ts";
import { shapeProviders } from "../shared/providerShape.ts";
import {
  subscriptionUsageSchema,
  type SubscriptionUsage,
  type SubscriptionUsageProvider,
} from "../shared/subscriptionUsage.ts";

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

const jsonRecordSchema = z.record(z.string(), z.unknown());
const numericValueSchema = z
  .union([z.number().finite(), z.string().trim().regex(/^-?\d+(?:\.\d+)?$/)])
  .transform(Number);

type UsageLimit = SubscriptionUsage["limits"][number];
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  const parsed = jsonRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  const parsed = numericValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function percent(value: unknown): number | undefined {
  const parsed = number(value);
  return parsed === undefined ? undefined : Math.min(100, Math.max(0, parsed));
}

function resetAt(value: unknown): string | undefined {
  const date = text(value);
  if (date) return date;
  const timestamp = number(value);
  if (timestamp === undefined) return undefined;
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function durationLabel(value: unknown, fallback: string): string {
  const seconds = number(value);
  if (seconds === undefined || seconds <= 0) return fallback;
  if (seconds % 604_800 === 0) return `${seconds / 604_800}-week limit`;
  if (seconds % 86_400 === 0) return `${seconds / 86_400}-day limit`;
  if (seconds % 3600 === 0) return `${seconds / 3600}-hour limit`;
  if (seconds % 60 === 0) return `${seconds / 60}-minute limit`;
  return fallback;
}

function addLimit(limits: UsageLimit[], label: string, usedPercent: unknown, reset?: unknown): void {
  const used = percent(usedPercent);
  if (used === undefined) return;
  const nextReset = resetAt(reset);
  limits.push({ label, usedPercent: used, ...(nextReset ? { resetAt: nextReset } : {}) });
}

function addRateWindows(limits: UsageLimit[], value: unknown, label: string): void {
  const rateLimit = record(value);
  if (!rateLimit) return;
  for (const [key, fallback] of [["primary_window", label], ["secondary_window", `${label} (long)`]] as const) {
    const window = record(rateLimit[key]);
    if (!window) continue;
    addLimit(
      limits,
      durationLabel(window["limit_window_seconds"], fallback),
      window["used_percent"],
      window["reset_at"],
    );
  }
}

function openAiLimits(body: JsonRecord): UsageLimit[] {
  const limits: UsageLimit[] = [];
  addRateWindows(limits, body["rate_limit"], "Usage limit");
  const additional = z.array(jsonRecordSchema).safeParse(body["additional_rate_limits"]);
  if (additional.success) {
    for (const item of additional.data) {
      addRateWindows(limits, item["rate_limit"], text(item["limit_name"]) ?? "Additional usage limit");
    }
  }
  return limits;
}

function anthropicLimits(body: JsonRecord): UsageLimit[] {
  const limits: UsageLimit[] = [];
  for (const [key, label] of [
    ["five_hour", "5-hour limit"],
    ["seven_day", "Weekly limit"],
    ["seven_day_sonnet", "Sonnet weekly limit"],
  ] as const) {
    const limit = record(body[key]);
    if (limit) addLimit(limits, label, limit["utilization"] ?? limit["percent"], limit["resets_at"] ?? limit["reset_at"]);
  }
  const current = z.array(jsonRecordSchema).safeParse(body["limits"]);
  if (current.success) {
    for (const item of current.data) {
      const detail = record(item["detail"]) ?? item;
      const kind = text(item["kind"]);
      addLimit(
        limits,
        kind === "session" ? "5-hour limit" : kind === "weekly_all" ? "Weekly limit" : kind === "weekly_scoped" ? "Model weekly limit" : "Usage limit",
        detail["utilization"] ?? detail["percent"],
        detail["resets_at"] ?? detail["reset_at"],
      );
    }
  }
  return limits;
}

function kimiLimits(body: JsonRecord): UsageLimit[] {
  const limits: UsageLimit[] = [];
  const weekly = record(body["usage"]);
  if (weekly) {
    const used = number(weekly["used"]);
    const total = number(weekly["limit"]);
    if (used !== undefined && total && total > 0) addLimit(limits, text(weekly["name"]) ?? "Weekly limit", (used / total) * 100, weekly["resetTime"]);
  }
  const windows = z.array(jsonRecordSchema).safeParse(body["limits"]);
  if (windows.success) {
    for (const item of windows.data) {
      const detail = record(item["detail"]);
      if (!detail) continue;
      const used = number(detail["used"]);
      const total = number(detail["limit"]);
      if (used === undefined || !total || total <= 0) continue;
      const window = record(item["window"]);
      const duration = number(window?.["duration"]);
      const unit = text(window?.["timeUnit"]);
      const label = duration && unit === "TIME_UNIT_MINUTE" && duration % 60 === 0
        ? `${duration / 60}-hour limit`
        : duration && unit === "TIME_UNIT_WEEK"
          ? `${duration}-week limit`
          : text(item["name"]) ?? "Usage limit";
      addLimit(limits, label, (used / total) * 100, detail["resetTime"]);
    }
  }
  return limits;
}

function githubCopilotLimits(body: JsonRecord): UsageLimit[] {
  const snapshots = record(body["quota_snapshots"]);
  const premium = record(snapshots?.["premium_interactions"] ?? snapshots?.["ai_credits"]);
  if (!premium) return [];
  const remainingPercent = number(premium["percent_remaining"]);
  if (remainingPercent !== undefined) {
    const limits: UsageLimit[] = [];
    addLimit(limits, "Monthly premium requests", 100 - remainingPercent, body["quota_reset_date"]);
    return limits;
  }
  const remaining = number(premium["remaining"]);
  const total = number(premium["entitlement"]);
  if (remaining === undefined || total === undefined || total <= 0) return [];
  const limits: UsageLimit[] = [];
  addLimit(limits, "Monthly premium requests", ((total - remaining) / total) * 100, body["quota_reset_date"]);
  return limits;
}

async function usageResponse(url: string, headers: Record<string, string>): Promise<JsonRecord> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Usage request failed (${response.status}).`);
  return jsonRecordSchema.parse(await response.json());
}

async function oauthAccessToken(providerId: SubscriptionUsageProvider): Promise<string> {
  const credential = readStoredCredential(providerId);
  if (credential?.type !== "oauth") throw new Error("This provider is not connected with a subscription.");
  const runtime = await ModelRuntime.create({ allowModelNetwork: false });
  const auth = await runtime.getAuth(providerId);
  const apiKey = auth?.auth.apiKey;
  if (apiKey) return apiKey;
  for (const [name, value] of Object.entries(auth?.auth.headers ?? {})) {
    if (name.toLowerCase() !== "authorization" || typeof value !== "string") continue;
    if (value.toLowerCase().startsWith("bearer ")) return value.slice("Bearer ".length);
  }
  throw new Error("This provider did not return a subscription access token.");
}

function chatGptAccountId(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return undefined;
    const claims = record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return text(record(claims?.["https://api.openai.com/auth"])?.["chatgpt_account_id"]);
  } catch {
    return undefined;
  }
}

export async function getSubscriptionUsage(providerId: SubscriptionUsageProvider): Promise<SubscriptionUsage> {
  switch (providerId) {
    case "openai-codex": {
      const accessToken = await oauthAccessToken(providerId);
      const accountId = chatGptAccountId(accessToken);
      if (!accountId) throw new Error("Could not identify the ChatGPT account.");
      const body = await usageResponse("https://chatgpt.com/backend-api/wham/usage", {
        Authorization: `Bearer ${accessToken}`,
        "chatgpt-account-id": accountId,
        originator: "pi",
        "User-Agent": "pi",
      });
      return subscriptionUsageSchema.parse({ provider: providerId, limits: openAiLimits(body) });
    }
    case "anthropic": {
      const accessToken = await oauthAccessToken(providerId);
      const body = await usageResponse("https://api.anthropic.com/api/oauth/usage", {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
        "User-Agent": "claude-cli/2.1.75",
        "x-app": "cli",
      });
      return subscriptionUsageSchema.parse({ provider: providerId, limits: anthropicLimits(body) });
    }
    case "kimi-coding": {
      const accessToken = await oauthAccessToken(providerId);
      const body = await usageResponse("https://api.kimi.com/coding/v1/usages", {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      });
      return subscriptionUsageSchema.parse({ provider: providerId, limits: kimiLimits(body) });
    }
    case "github-copilot": {
      const credential = readStoredCredential(providerId);
      if (credential?.type !== "oauth") throw new Error("This provider is not connected with a subscription.");
      const body = await usageResponse("https://api.github.com/copilot_internal/user", {
        Authorization: `token ${credential.refresh}`,
        Accept: "application/json",
        "User-Agent": "GitHubCopilotChat/0.35.0",
        "Editor-Version": "vscode/1.107.0",
        "Editor-Plugin-Version": "copilot-chat/0.35.0",
        "Copilot-Integration-Id": "vscode-chat",
        "X-GitHub-Api-Version": "2026-06-01",
      });
      return subscriptionUsageSchema.parse({ provider: providerId, limits: githubCopilotLimits(body) });
    }
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
