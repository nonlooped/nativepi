import { createHash } from "node:crypto";
import { z } from "zod";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { capacitySchema, type SubscriptionCapacity } from "../shared/subscription-capacity.ts";
const percent = z.number().finite().min(0).max(100);
const codexWindow = z.object({ used_percent: percent, limit_window_seconds: z.number().positive().optional(), reset_at: z.number().finite().optional() });
const codexSchema = z.object({ plan_type: z.string().optional(), credits: z.object({ balance: z.union([z.string().max(100), z.number().finite()]).nullish(), unlimited: z.boolean().optional() }).nullish(), rate_limit: z.object({ primary_window: codexWindow.nullish(), secondary_window: codexWindow.nullish() }).nullish(), additional_rate_limits: z.array(z.object({ limit_name: z.string(), rate_limit: z.object({ primary_window: codexWindow.nullish(), secondary_window: codexWindow.nullish() }) })).nullish() });
const claudeWindow = z.object({ utilization: percent, resets_at: z.string().datetime({ offset: true }).nullish() });
const claudeSchema = z.record(z.string(), z.unknown());
export function parseCapacity(provider: string, body: unknown): Pick<SubscriptionCapacity, "windows" | "plan" | "details"> {
  const windows: SubscriptionCapacity["windows"] = [];
  if (provider === "openai-codex") {
    const value = codexSchema.parse(body);
    for (const group of [{ limit_name: "Usage", rate_limit: value.rate_limit }, ...(value.additional_rate_limits ?? [])]) {
      for (const [key, fallback] of [["primary_window", "short window"], ["secondary_window", "long window"]] as const) {
        const window = group.rate_limit?.[key];
        if (window) windows.push({ label: `${group.limit_name} · ${window.limit_window_seconds ? `${window.limit_window_seconds / 3600} hours` : fallback}`, usedPercent: window.used_percent, ...(window.reset_at ? { resetAt: new Date(window.reset_at * 1000).toISOString() } : {}) });
      }
    }
    return { windows, plan: value.plan_type, details: value.credits ? [value.credits.unlimited ? "Unlimited credits" : value.credits.balance != null ? `Credit balance: ${value.credits.balance}` : "Credit balance not supplied"] : undefined };
  }
  const value = claudeSchema.parse(body);
  for (const [key, label] of [["five_hour", "5 hours"], ["seven_day", "Weekly"], ["seven_day_sonnet", "Sonnet weekly"], ["seven_day_opus", "Opus weekly"]]) {
    if (value[key!] == null) continue;
    const window = claudeWindow.parse(value[key!]);
    windows.push({ label: label!, usedPercent: window.utilization, ...(window.resets_at ? { resetAt: new Date(window.resets_at).toISOString() } : {}) });
  }
  return { windows };
}
async function quotaBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1024 * 1024) throw new Error();
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
/** One backend reader: bounded requests, no persisted credentials or provider bodies. */
export function createCapacityReader(getRuntime: () => Promise<ModelRuntime>, request: (url: string, options: RequestInit) => Promise<Response> = fetch) {
  const cache = new Map<string, SubscriptionCapacity>();
  const pending = new Map<string, Promise<SubscriptionCapacity>>();
  const attempted = new Map<string, number>();
  const identities = new Map<string, string>();
  return async function read(): Promise<SubscriptionCapacity[]> {
    const runtime = await getRuntime();
    await runtime.getAvailable();
    const providers = runtime.getProviders().filter(p => runtime.hasConfiguredAuth(p.id));
    return Promise.all(providers.map(async provider => {
      const base = { provider: provider.id, name: provider.name, windows: [], stale: false };
      if (!["openai-codex", "anthropic"].includes(provider.id) || !runtime.isUsingOAuth(provider.id)) {
        cache.delete(provider.id);
        return capacitySchema.parse({ ...base, status: "unsupported", message: "No supported subscription quota endpoint for this connection." });
      }
      let resolvedAuth: Awaited<ReturnType<ModelRuntime["getAuth"]>>;
      try { resolvedAuth = await runtime.getAuth(provider.id); } catch { resolvedAuth = undefined; }
      const identity = createHash("sha256").update(JSON.stringify(resolvedAuth ?? null)).digest("hex");
      if (identities.get(provider.id) !== identity) {
        cache.delete(provider.id); attempted.delete(provider.id); identities.set(provider.id, identity);
      }
      const previous = cache.get(provider.id);
      const pendingKey = `${provider.id}:${identity}`;
      const active = pending.get(pendingKey);
      if (active) return active;
      if (Date.now() - (attempted.get(provider.id) ?? 0) < 60_000 && previous) return previous;
      attempted.set(provider.id, Date.now());
      const run = (async () => {
        try {
          const auth = resolvedAuth;
          const token = auth?.auth.apiKey ?? Object.entries(auth?.auth.headers ?? {}).find(([key]) => key.toLowerCase() === "authorization")?.[1]?.replace(/^Bearer /i, "");
          if (!token) throw new Error();
          const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
          if (provider.id === "openai-codex") {
            const payload = token.split(".")[1];
            if (!payload) throw new Error();
            const claims = z.object({ "https://api.openai.com/auth": z.object({ chatgpt_account_id: z.string().min(1) }) }).parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
            headers["chatgpt-account-id"] = claims["https://api.openai.com/auth"].chatgpt_account_id;
          }
          if (provider.id === "anthropic") headers["anthropic-beta"] = "oauth-2025-04-20";
          const response = await request(provider.id === "openai-codex" ? "https://chatgpt.com/backend-api/wham/usage" : "https://api.anthropic.com/api/oauth/usage", { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
          if (!response.ok) {
            const retry = response.headers.get("retry-after");
            if (retry) {
              const delay = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
              if (Number.isFinite(delay) && delay > 60_000) attempted.set(provider.id, Date.now() + Math.min(delay, 86_400_000) - 60_000);
            }
            throw new Error(`HTTP ${response.status}`);
          }
          const parsed = parseCapacity(provider.id, await quotaBody(response));
          const result = capacitySchema.parse({ ...base, ...parsed, status: parsed.windows.length ? "ready" : "unsupported", fetchedAt: new Date().toISOString(), message: parsed.windows.length ? undefined : "The provider returned no quota windows." });
          if (identities.get(provider.id) === identity) cache.set(provider.id, result);
          return result;
        } catch (error) {
          // Never forward response bodies, tokens or arbitrary network errors.
          const status = error instanceof Error && /^HTTP \d{3}$/.test(error.message) ? ` (${error.message})` : "";
          const result = capacitySchema.parse({ ...base, ...(previous ? { windows: previous.windows, plan: previous.plan, details: previous.details, fetchedAt: previous.fetchedAt } : {}), status: "error", stale: !!previous?.fetchedAt, message: `Quota refresh failed${status}. Try again later; check provider sign-in if it persists.` });
          if (identities.get(provider.id) === identity) cache.set(provider.id, result);
          return result;
        }
      })();
      pending.set(pendingKey, run);
      try { return await run; } finally { pending.delete(pendingKey); }
    }));
  };
}
