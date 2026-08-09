import { DynamicBorder, readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { connect } from "@nativepi/extension-api/host";
import {
  subscriptionUsageProtocol,
  type SubscriptionUsage,
  type SubscriptionUsageLimit,
  type SubscriptionUsages,
  type UsageReading,
} from "../types.ts";

type JsonRecord = Record<string, unknown>;

interface AuthResolver {
  getProviderAuth(providerId: string): Promise<unknown>;
}

const SUPPORTED_PROVIDERS = new Set(["anthropic", "github-copilot", "kimi-coding", "openai-codex"]);
const USAGE_STATUS = "subscription-usage";

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
    addLimit(limits, openAiLimitLabel(seconds, scope), window["used_percent"], window["reset_at"], seconds);
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

async function oauthAccessToken(
  providerId: string,
  resolver: AuthResolver,
  credentialReader: typeof readStoredCredential,
) {
  const credential = credentialReader(providerId);
  // Subscription usage endpoints accept the provider's OAuth session, not an
  // API key. Treat key-backed accounts as unsupported instead of sending the
  // renderer an error for a control it should not show.
  if (credential?.type !== "oauth") return undefined;
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
export async function getSubscriptionUsage(
  providerId: string,
  resolver: AuthResolver,
  credentialReader: typeof readStoredCredential = readStoredCredential,
): Promise<SubscriptionUsage | undefined> {
  if (!SUPPORTED_PROVIDERS.has(providerId)) return undefined;

  switch (providerId) {
    case "openai-codex": {
      const accessToken = await oauthAccessToken(providerId, resolver, credentialReader);
      if (!accessToken) return undefined;
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
      const accessToken = await oauthAccessToken(providerId, resolver, credentialReader);
      if (!accessToken) return undefined;
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
      const accessToken = await oauthAccessToken(providerId, resolver, credentialReader);
      if (!accessToken) return undefined;
      const body = await usageResponse("https://api.kimi.com/coding/v1/usages", {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      });
      return usage(providerId, kimiLimits(body));
    }
    case "github-copilot": {
      const credential = credentialReader(providerId);
      if (credential?.type !== "oauth") return undefined;
      await resolver.getProviderAuth(providerId);
      const current = credentialReader(providerId);
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

function providerLabel(provider: string): string {
  return provider === "github-copilot"
    ? "GitHub Copilot"
    : provider === "openai-codex"
      ? "OpenAI"
      : provider === "kimi-coding"
        ? "Kimi Code"
        : "Anthropic";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function countdown(resetAt: string | undefined): string | undefined {
  if (!resetAt) return undefined;
  const remaining = Date.parse(resetAt) - Date.now();
  if (Number.isNaN(remaining)) return undefined;
  if (remaining <= 0) return "resets now";
  const minutes = Math.round(remaining / 60_000);
  if (minutes < 60) return `resets in ${plural(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `resets in ${plural(hours, "hour")}`;
  return `resets in ${plural(Math.round(hours / 24), "day")}`;
}

/** How far into the limit window we are, which is what makes "on track" mean anything. */
function pace(limit: SubscriptionUsageLimit): string | undefined {
  if (!limit.resetAt || !limit.windowSeconds) return undefined;
  const reset = Date.parse(limit.resetAt);
  if (Number.isNaN(reset)) return undefined;
  const window = limit.windowSeconds * 1000;
  const elapsed = ((Date.now() - (reset - window)) / window) * 100;
  if (elapsed <= 0 || elapsed >= 100) return undefined;
  const drift = limit.usedPercent - elapsed;
  return drift > 12 ? "at risk" : drift < -12 ? "ahead of pace" : "on track";
}

function usageTone(usedPercent: number): ThemeColor {
  return usedPercent >= 90 ? "error" : usedPercent >= 75 ? "warning" : "success";
}

function highestUsed(data: SubscriptionUsage): number {
  return data.limits.reduce((value, item) => Math.max(value, item.usedPercent), 0);
}

function showStatus(context: ExtensionContext, data: SubscriptionUsage | undefined): void {
  const theme = context.ui.theme;
  if (!data || data.limits.length === 0) {
    context.ui.setStatus(USAGE_STATUS, undefined);
    return;
  }
  const used = highestUsed(data);
  context.ui.setStatus(
    USAGE_STATUS,
    theme.fg("muted", "Usage ") + theme.fg(usageTone(used), `${Math.round(100 - used)}% left`),
  );
}

/**
 * The slices of Pi's TUI the panel actually uses.
 *
 * `TUI` and `KeybindingsManager` carry private fields, and this package resolves
 * `@earendil-works/pi-tui` to a different copy than Pi's own, so naming those
 * classes here would compare two nominally distinct types.
 */
type PanelHost = { requestRender(): void };
type PanelKeys = {
  matches(data: string, binding: "tui.select.cancel"): boolean;
  getKeys(binding: "tui.select.cancel"): string[];
};

type Reading = { loading: boolean; usage?: SubscriptionUsage; error?: string };

const BAR_MAX_WIDTH = 28;

/** The limit readings, drawn to whatever width the terminal currently is. */
class UsageBody implements Component {
  private state: Reading = { loading: true };

  constructor(
    private readonly theme: Theme,
    private readonly provider: string,
  ) {}

  setState(state: Reading): void {
    this.state = state;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const theme = this.theme;
    const inner = Math.max(24, width - 2);
    const row = (text: string) => ` ${text}`;
    const note = (color: ThemeColor, text: string) => [row(theme.fg(color, truncateToWidth(text, inner, "…")))];

    if (this.state.error) return note("error", `Unable to read subscription usage. ${this.state.error}`);
    if (this.state.loading) return note("muted", "Reading subscription usage…");
    if (!this.state.usage) return note("muted", "This provider does not report subscription usage.");

    const limits = [...this.state.usage.limits].sort((a, b) => b.usedPercent - a.usedPercent);
    if (limits.length === 0) {
      return note("muted", `${providerLabel(this.provider)} did not report any subscription limits.`);
    }

    const bar = Math.max(10, Math.min(BAR_MAX_WIDTH, inner - 34));
    const lines: string[] = [];
    for (const limit of limits) {
      if (lines.length > 0) lines.push("");
      const tone = usageTone(limit.usedPercent);
      const left = `${Math.round(100 - limit.usedPercent)}% left`;
      const label = truncateToWidth(limit.label, Math.max(8, inner - left.length - 2), "…");
      const gap = " ".repeat(Math.max(1, inner - visibleWidth(label) - left.length));
      lines.push(row(theme.fg("text", label) + gap + theme.fg(tone, left)));

      const filled = Math.round((limit.usedPercent / 100) * bar);
      const meta = [countdown(limit.resetAt), pace(limit)].filter(Boolean).join(" · ");
      lines.push(
        row(
          theme.fg(tone, "█".repeat(filled)) +
            theme.fg("dim", "░".repeat(bar - filled)) +
            (meta ? `  ${theme.fg("muted", truncateToWidth(meta, Math.max(0, inner - bar - 2), "…"))}` : ""),
        ),
      );
    }
    return lines;
  }
}

/**
 * The `/usage` panel.
 *
 * The reading is fetched while the panel is already on screen, so a slow
 * provider shows as a loading line rather than as a command that does nothing.
 */
class UsagePanel extends Container {
  private readonly body: UsageBody;
  private closed = false;

  constructor(
    private readonly tui: PanelHost,
    theme: Theme,
    private readonly keybindings: PanelKeys,
    provider: string,
    private readonly load: () => Promise<SubscriptionUsage | undefined>,
    private readonly done: () => void,
  ) {
    super();
    this.body = new UsageBody(theme, provider);
    const hint = (key: string, description: string) => theme.fg("dim", key) + theme.fg("muted", ` ${description}`);

    this.addChild(new DynamicBorder((line) => theme.fg("border", line)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold("Subscription usage")), 1, 0));
    this.addChild(new Text(theme.fg("dim", `${providerLabel(provider)} limits for this account`), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.body);
    this.addChild(new Spacer(1));
    this.addChild(
      new Text([hint("r", "refresh"), hint(keybindings.getKeys("tui.select.cancel").join("/"), "close")].join("  "), 1, 0),
    );
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((line) => theme.fg("border", line)));

    this.refresh();
  }

  private refresh(): void {
    this.body.setState({ loading: true });
    this.tui.requestRender();
    void this.load()
      .then((usage) => this.closed || this.body.setState({ loading: false, usage }))
      .catch((error: unknown) =>
        this.closed || this.body.setState({ loading: false, error: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => this.tui.requestRender());
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.dispose();
      this.done();
      return;
    }
    if (data === "r" || data === "R") this.refresh();
  }

  dispose(): void {
    this.closed = true;
  }
}

export default function subscriptionUsageExtension(pi: ExtensionAPI): void {
  /**
   * The window asks for usage on its own schedule, and Pi only hands out a
   * context inside a handler, so the latest one is kept for the channel to use.
   */
  let latest: ExtensionContext | undefined;

  const ui = connect("@nativepi/subscription-usage", subscriptionUsageProtocol, {
    usage: async (params) => {
      // The graphical control can mount before a new Pi session reports its
      // context. It retries on session_start, so this is unsupported for now.
      if (!latest) return { supported: false } satisfies UsageReading;
      const providerId = params?.providerId ?? latest.model?.provider;
      if (!providerId) throw new Error("No model is selected.");
      const data = await getSubscriptionUsage(providerId, latest.modelRegistry);
      return { supported: data !== undefined, ...(data ? { usage: data } : {}) } satisfies UsageReading;
    },
    usages: async () => {
      if (!latest) return { usages: [] } satisfies SubscriptionUsages;
      const settled = await Promise.allSettled(
        [...SUPPORTED_PROVIDERS].map((providerId) => getSubscriptionUsage(providerId, latest!.modelRegistry)),
      );
      const usages = settled.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
      return { usages } satisfies SubscriptionUsages;
    },
  });

  const remember = (_event: unknown, context: ExtensionContext): void => {
    latest = context;
  };

  pi.on("session_start", (event, context) => {
    remember(event, context);
    // A renderer can mount and ask while Pi is still creating this session.
    // The initial unsupported response keeps it quiet; this event makes it
    // retry once the context needed to read usage exists.
    if (ui.connected) ui.emit("changed");
    else showStatus(context, undefined);
  });
  pi.on("model_select", (event, context) => {
    remember(event, context);
    if (ui.connected) ui.emit("changed");
    else showStatus(context, undefined);
  });
  pi.on("turn_end", remember);

  pi.registerCommand("usage", {
    description: "Show subscription usage for the active provider",
    handler: async (_args, context) => {
      latest = context;
      const providerId = context.model?.provider;
      if (!providerId) {
        context.ui.notify("No model is selected.", "warning");
        return;
      }
      if (!SUPPORTED_PROVIDERS.has(providerId)) {
        context.ui.notify("This provider does not report subscription usage.", "info");
        return;
      }
      let reading: SubscriptionUsage | undefined;
      await context.ui.custom<null>(
        (tui, theme, keybindings, done) =>
          new UsagePanel(
            tui,
            theme,
            keybindings,
            providerId,
            async () => (reading = await getSubscriptionUsage(providerId, context.modelRegistry)),
            () => done(null),
          ),
      );
      showStatus(context, reading);
    },
  });
}
