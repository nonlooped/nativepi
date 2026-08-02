import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, InlineExtension } from "@earendil-works/pi-coding-agent";

/**
 * Provider subscription endpoints belong here rather than in NativePi itself.
 * This file is copied to Pi's global extension directory, so it intentionally
 * has no imports from the desktop application.
 */
export interface SubscriptionUsageLimit {
  label: string;
  usedPercent: number;
  resetAt?: string;
  windowSeconds?: number;
}

export interface SubscriptionUsage {
  provider: string;
  limits: SubscriptionUsageLimit[];
}

export interface SubscriptionAuthResolver {
  getProviderAuth(providerId: string): Promise<unknown>;
}

type JsonRecord = Record<string, unknown>;

const SUPPORTED_PROVIDERS = new Set(["anthropic", "github-copilot", "kimi-coding", "openai-codex"]);
const USAGE_STATUS = "nativepi-subscription-usage";
const USAGE_WIDGET = "nativepi-subscription-usage";

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = record(item);
    return parsed ? [parsed] : [];
  });
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

const KIMI_TIME_UNITS: Record<string, number> = {
  TIME_UNIT_MINUTE: 60,
  TIME_UNIT_HOUR: 3600,
  TIME_UNIT_DAY: 86_400,
  TIME_UNIT_WEEK: 604_800,
};

function kimiWindowSeconds(window: JsonRecord | undefined): number | undefined {
  const duration = number(window?.["duration"]);
  const unit = KIMI_TIME_UNITS[text(window?.["timeUnit"]) ?? ""];
  return duration && unit ? duration * unit : undefined;
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

function addLimit(
  limits: SubscriptionUsageLimit[],
  label: string,
  usedPercent: unknown,
  reset?: unknown,
  window?: number,
): void {
  const used = percent(usedPercent);
  if (used === undefined) return;
  const nextReset = resetAt(reset);
  limits.push({
    label,
    usedPercent: used,
    ...(nextReset ? { resetAt: nextReset } : {}),
    ...(window && window > 0 ? { windowSeconds: window } : {}),
  });
}

function openAiLimitLabel(seconds: number | undefined, scope?: string): string {
  const window = durationLabel(seconds, "Usage limit");
  if (!scope) return window === "1-week limit" ? "Weekly limit" : window;
  const name = scope
    .replace(/^gpt[-_ ]?/i, "GPT-")
    .replace(/[-_]+/g, " ")
    .replace(/^GPT (?=\d)/, "GPT-")
    .replace(/\bcodex\b/gi, "Codex")
    .replace(/\bspark\b/gi, "Spark");
  return window === "1-week limit" ? `${name} weekly limit` : `${name} ${window}`;
}

function addRateWindows(limits: SubscriptionUsageLimit[], value: unknown, scope?: string): void {
  const rateLimit = record(value);
  if (!rateLimit) return;
  for (const key of ["primary_window", "secondary_window"] as const) {
    const window = record(rateLimit[key]);
    if (!window) continue;
    const seconds = number(window["limit_window_seconds"]);
    addLimit(
      limits,
      openAiLimitLabel(seconds, scope),
      window["used_percent"],
      window["reset_at"],
      seconds,
    );
  }
}

export function openAiLimits(body: JsonRecord): SubscriptionUsageLimit[] {
  const limits: SubscriptionUsageLimit[] = [];
  addRateWindows(limits, body["rate_limit"]);
  for (const item of records(body["additional_rate_limits"])) {
    addRateWindows(limits, item["rate_limit"], text(item["limit_name"]));
  }
  return limits;
}

export function anthropicLimits(body: JsonRecord): SubscriptionUsageLimit[] {
  const limits: SubscriptionUsageLimit[] = [];
  for (const [key, label, window] of [
    ["five_hour", "5-hour limit", 18_000],
    ["seven_day", "Weekly limit", 604_800],
    ["seven_day_sonnet", "Sonnet weekly limit", 604_800],
  ] as const) {
    const limit = record(body[key]);
    if (limit) {
      addLimit(limits, label, limit["utilization"] ?? limit["percent"], limit["resets_at"] ?? limit["reset_at"], window);
    }
  }
  for (const item of records(body["limits"])) {
    const detail = record(item["detail"]) ?? item;
    const kind = text(item["kind"]);
    const shape = kind === "session"
      ? { label: "5-hour limit", window: 18_000 }
      : kind === "weekly_all"
        ? { label: "Weekly limit", window: 604_800 }
        : kind === "weekly_scoped"
          ? { label: "Model weekly limit", window: 604_800 }
          : { label: "Usage limit", window: undefined };
    addLimit(
      limits,
      shape.label,
      detail["utilization"] ?? detail["percent"],
      detail["resets_at"] ?? detail["reset_at"],
      shape.window,
    );
  }
  return limits;
}

export function kimiLimits(body: JsonRecord): SubscriptionUsageLimit[] {
  const limits: SubscriptionUsageLimit[] = [];
  const weekly = record(body["usage"]);
  if (weekly) {
    const used = number(weekly["used"]);
    const total = number(weekly["limit"]);
    if (used !== undefined && total && total > 0) {
      addLimit(limits, text(weekly["name"]) ?? "Weekly limit", (used / total) * 100, weekly["resetTime"]);
    }
  }
  for (const item of records(body["limits"])) {
    const detail = record(item["detail"]);
    if (!detail) continue;
    const used = number(detail["used"]);
    const total = number(detail["limit"]);
    if (used === undefined || !total || total <= 0) continue;
    const seconds = kimiWindowSeconds(record(item["window"]));
    const label = durationLabel(seconds, text(item["name"]) ?? "Usage limit");
    addLimit(limits, label, (used / total) * 100, detail["resetTime"], seconds);
  }
  return limits;
}

export function githubCopilotLimits(body: JsonRecord): SubscriptionUsageLimit[] {
  const snapshots = record(body["quota_snapshots"]);
  const premium = record(snapshots?.["premium_interactions"] ?? snapshots?.["ai_credits"]);
  if (!premium) return [];
  const remainingPercent = number(premium["percent_remaining"]);
  if (remainingPercent !== undefined) {
    const limits: SubscriptionUsageLimit[] = [];
    addLimit(limits, "Monthly premium requests", 100 - remainingPercent, body["quota_reset_date"]);
    return limits;
  }
  const remaining = number(premium["remaining"]);
  const total = number(premium["entitlement"]);
  if (remaining === undefined || total === undefined || total <= 0) return [];
  const limits: SubscriptionUsageLimit[] = [];
  addLimit(limits, "Monthly premium requests", ((total - remaining) / total) * 100, body["quota_reset_date"]);
  return limits;
}

async function usageResponse(url: string, headers: Record<string, string>): Promise<JsonRecord> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Usage request failed (${response.status}).`);
  const body = record(await response.json());
  if (!body) throw new Error("Usage response was not an object.");
  return body;
}

function authResult(value: unknown): JsonRecord | undefined {
  return record(record(value)?.["auth"]);
}

async function oauthAccessToken(providerId: string, resolver: SubscriptionAuthResolver): Promise<string> {
  const credential = readStoredCredential(providerId);
  if (credential?.type !== "oauth") throw new Error("This provider is not connected with a subscription.");
  const auth = authResult(await resolver.getProviderAuth(providerId));
  const apiKey = text(auth?.["apiKey"]);
  if (apiKey) return apiKey;
  const headers = record(auth?.["headers"]);
  for (const [name, value] of Object.entries(headers ?? {})) {
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

function usage(provider: string, limits: SubscriptionUsageLimit[]): SubscriptionUsage {
  return { provider, limits };
}

/** Fetch the supported provider's subscription data using Pi's resolved auth. */
export async function getNativePiSubscriptionUsage(
  providerId: string,
  resolver: SubscriptionAuthResolver,
): Promise<SubscriptionUsage | undefined> {
  if (!SUPPORTED_PROVIDERS.has(providerId)) return undefined;

  switch (providerId) {
    case "openai-codex": {
      const accessToken = await oauthAccessToken(providerId, resolver);
      const accountId = chatGptAccountId(accessToken);
      if (!accountId) throw new Error("Could not identify the ChatGPT account.");
      const body = await usageResponse("https://chatgpt.com/backend-api/wham/usage", {
        Authorization: `Bearer ${accessToken}`,
        "chatgpt-account-id": accountId,
        originator: "pi",
        "User-Agent": "pi",
      });
      return usage(providerId, openAiLimits(body));
    }
    case "anthropic": {
      const accessToken = await oauthAccessToken(providerId, resolver);
      const body = await usageResponse("https://api.anthropic.com/api/oauth/usage", {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
        "User-Agent": "claude-cli/2.1.75",
        "x-app": "cli",
      });
      return usage(providerId, anthropicLimits(body));
    }
    case "kimi-coding": {
      const accessToken = await oauthAccessToken(providerId, resolver);
      const body = await usageResponse("https://api.kimi.com/coding/v1/usages", {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      });
      return usage(providerId, kimiLimits(body));
    }
    case "github-copilot": {
      const credential = readStoredCredential(providerId);
      if (credential?.type !== "oauth") throw new Error("This provider is not connected with a subscription.");
      await resolver.getProviderAuth(providerId);
      const current = readStoredCredential(providerId);
      const refresh = current?.type === "oauth" ? current.refresh : credential.refresh;
      const body = await usageResponse("https://api.github.com/copilot_internal/user", {
        Authorization: `token ${refresh}`,
        Accept: "application/json",
        "User-Agent": "GitHubCopilotChat/0.35.0",
        "Editor-Version": "vscode/1.107.0",
        "Editor-Plugin-Version": "copilot-chat/0.35.0",
        "Copilot-Integration-Id": "vscode-chat",
        "X-GitHub-Api-Version": "2026-06-01",
      });
      return usage(providerId, githubCopilotLimits(body));
    }
  }
}

function resetLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function providerLabel(provider: string): string {
  return provider === "github-copilot" ? "GitHub Copilot" : provider === "openai-codex" ? "OpenAI" : provider === "kimi-coding" ? "Kimi Code" : "Anthropic";
}

function usageWidget(usage: SubscriptionUsage): string[] {
  if (usage.limits.length === 0) return [`${providerLabel(usage.provider)} did not report any subscription limits.`];
  return [
    `${providerLabel(usage.provider)} subscription usage`,
    ...usage.limits.map((item) =>
      `${item.label}: ${Math.round(100 - item.usedPercent)}% left${item.resetAt ? ` · resets ${resetLabel(item.resetAt)}` : ""}`,
    ),
  ];
}

function clearStandaloneUsage(context: ExtensionContext): void {
  context.ui.setStatus(USAGE_STATUS, undefined);
  context.ui.setWidget(USAGE_WIDGET, undefined);
}

function showStandaloneUsage(context: ExtensionContext, data: SubscriptionUsage): void {
  const highest = data.limits.reduce((value, item) => Math.max(value, item.usedPercent), 0);
  context.ui.setStatus(
    USAGE_STATUS,
    data.limits.length > 0 ? `Usage: ${Math.round(highest)}% used` : "Usage: no limits reported",
  );
  context.ui.setWidget(USAGE_WIDGET, usageWidget(data));
}

function activateStandaloneSubscriptionUsageExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, context) => clearStandaloneUsage(context));
  pi.on("model_select", (_event, context) => clearStandaloneUsage(context));

  pi.registerCommand("usage", {
    description: "Show subscription usage for the active provider",
    handler: async (_args, context) => {
      const providerId = context.model?.provider;
      if (!providerId) {
        context.ui.notify("No model is selected.", "warning");
        return;
      }
      clearStandaloneUsage(context);
      try {
        const data = await getNativePiSubscriptionUsage(providerId, context.modelRegistry);
        if (!data) {
          clearStandaloneUsage(context);
          context.ui.notify("This provider does not report subscription usage.", "info");
          return;
        }
        showStandaloneUsage(context, data);
        context.ui.notify("Subscription usage updated.", "info");
      } catch (error) {
        context.ui.notify(`Could not read subscription usage: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}

/** NativePi asks this inline extension for data; the copied file uses /usage. */
export const nativePiSubscriptionUsageExtension: InlineExtension = {
  name: "NativePi subscription usage",
  factory: () => {},
  hidden: true,
};

export default function nativePiSubscriptionUsageFileExtension(pi: ExtensionAPI): void {
  if (process.env["NATIVEPI_HOST"] === "1") return;
  activateStandaloneSubscriptionUsageExtension(pi);
}
