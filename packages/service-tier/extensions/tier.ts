import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Container, SelectList, Spacer, Text } from "@earendil-works/pi-tui";
import type { SelectItem } from "@earendil-works/pi-tui";
import { connect } from "@nativepi/extension-api/host";
import { serviceTierProtocol, type ServiceTier, type TierState } from "../types.ts";

const DEFAULT_TIER: ServiceTier = "standard";

const CHOICES: { tier: ServiceTier; label: string; description: string }[] = [
  { tier: "standard", label: "Standard", description: "Normal priority, steady subscription usage" },
  { tier: "fast", label: "Fast", description: "Priority processing, spends subscription faster" },
];

/**
 * Pi does not expose provider service-tier metadata in its model shape, so the
 * models known to offer the faster tier are listed here. Keep it conservative:
 * sending the field to a model without the tier is a rejected request.
 */
const FAST_MODEL_IDS = new Set(["gpt-5.4", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"]);

const TIER_ENTRY = "service-tier";
const TIER_STATUS = "service-tier";

/**
 * The slices of Pi's TUI the panel actually uses.
 *
 * `TUI` and `KeybindingsManager` carry private fields, and this package resolves
 * `@earendil-works/pi-tui` to a different copy than Pi's own, so naming those
 * classes here would compare two nominally distinct types.
 */
type PanelHost = { requestRender(): void };
type PanelKeys = { getKeys(binding: "tui.select.confirm" | "tui.select.cancel"): string[] };

function tierLabel(tier: ServiceTier): string {
  return tier === "fast" ? "Fast" : "Standard";
}

function modelLabel(context: ExtensionContext): string {
  const model = context.model;
  if (!model) return "No model selected";
  return `${model.name || model.id} · ${context.modelRegistry.getProviderDisplayName(model.provider)}`;
}

/**
 * The `/speed` panel.
 *
 * Fast stays in the list on models that cannot use it, because the point of
 * opening this is to learn what the choice is, and a list that silently drops
 * the option teaches nothing.
 */
class SpeedPanel extends Container {
  private readonly list: SelectList;
  private readonly notice = new Text("", 1, 0);

  constructor(
    tui: PanelHost,
    theme: Theme,
    keybindings: PanelKeys,
    context: ExtensionContext,
    current: ServiceTier,
    done: (tier: ServiceTier | undefined) => void,
  ) {
    super();
    const supported = supportsFastServiceTier(context.model);
    const items: SelectItem[] = CHOICES.map((choice) => ({
      value: choice.tier,
      label: choice.tier === current ? `${choice.label} (current)` : choice.label,
      description: choice.tier === "fast" && !supported ? "Not offered by this model" : choice.description,
    }));

    this.list = new SelectList(items, items.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    }, { minPrimaryColumnWidth: 14, maxPrimaryColumnWidth: 24 });
    this.list.setSelectedIndex(CHOICES.findIndex((choice) => choice.tier === current));
    this.list.onCancel = () => done(undefined);
    this.list.onSelect = (item) => {
      if (item.value === "fast" && !supported) {
        this.notice.setText(theme.fg("warning", "Fast is only offered on supported Codex models."));
        tui.requestRender();
        return;
      }
      const chosen = asTier(item.value);
      if (chosen) done(chosen);
    };

    const hint = (key: string, description: string) => theme.fg("dim", key) + theme.fg("muted", ` ${description}`);

    this.addChild(new DynamicBorder((line) => theme.fg("border", line)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold("Response speed")), 1, 0));
    this.addChild(new Text(theme.fg("dim", modelLabel(context)), 1, 0));
    this.addChild(new Spacer(1));
    const indented = new Box(1, 0);
    indented.addChild(this.list);
    this.addChild(indented);
    this.addChild(this.notice);
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        [
          hint("↑↓", "navigate"),
          hint(keybindings.getKeys("tui.select.confirm").join("/"), "select"),
          hint(keybindings.getKeys("tui.select.cancel").join("/"), "cancel"),
        ].join("  "),
        1,
        0,
      ),
    );
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((line) => theme.fg("border", line)));
  }

  handleInput(data: string): void {
    this.list.handleInput(data);
  }
}

export function supportsFastServiceTier(model?: { provider?: string; id?: string } | null): boolean {
  return model?.provider === "openai-codex" && FAST_MODEL_IDS.has(model.id ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTier(value: unknown): ServiceTier | undefined {
  return value === "standard" || value === "fast" ? value : undefined;
}

/**
 * OpenAI's Codex API calls the Fast tier `priority`. Pi's provider hook gives us
 * the assembled request body, so this changes only the transport payload and not
 * the prompt, model selection, tool loop, or session entries.
 */
export function applyServiceTierPayload(payload: unknown, tier: ServiceTier): unknown {
  if (!isRecord(payload)) return payload;
  const next = { ...payload };
  if (tier === "fast") next["service_tier"] = "priority";
  else delete next["service_tier"];
  return next;
}

/** The tier this session last recorded, which is what makes the choice outlive a restart. */
export function persistedServiceTier(entries: readonly unknown[]) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!isRecord(entry) || entry["type"] !== "custom") continue;
    if (entry["customType"] !== TIER_ENTRY) continue;
    const tier = asTier(isRecord(entry["data"]) ? entry["data"]["tier"] : undefined);
    if (tier) return tier;
  }
  return undefined;
}

function persistedTier(context: ExtensionContext): ServiceTier | undefined {
  return persistedServiceTier(context.sessionManager.getEntries());
}

export default function serviceTierExtension(pi: ExtensionAPI): void {
  let tier = DEFAULT_TIER;
  let latest: ExtensionContext | undefined;

  const state = (context: ExtensionContext | undefined): TierState => ({
    supported: supportsFastServiceTier(context?.model),
    tier,
  });

  const showStatus = (context: ExtensionContext): void => {
    const theme = context.ui.theme;
    context.ui.setStatus(
      TIER_STATUS,
      supportsFastServiceTier(context.model)
        ? theme.fg("muted", "Speed ") + theme.fg(tier === "fast" ? "accent" : "text", tierLabel(tier))
        : undefined,
    );
  };

  const setTier = (next: ServiceTier, context: ExtensionContext): void => {
    tier = next;
    pi.appendEntry(TIER_ENTRY, { tier });
    if (!ui.connected) showStatus(context);
    ui.emit("changed", state(context));
  };

  const ui = connect("@nativepi/service-tier", serviceTierProtocol, {
    state: () => state(latest),
    set: ({ tier: next }) => {
      if (!latest) throw new Error("No active Pi session.");
      if (next === "fast" && !supportsFastServiceTier(latest.model)) {
        throw new Error("Fast response speed is only available for supported Codex models.");
      }
      setTier(next, latest);
      return state(latest);
    },
  });

  pi.on("session_start", (_event, context) => {
    latest = context;
    // A tier chosen before the first message has nothing to be recorded against
    // yet, so an unrecorded session keeps the pending choice rather than
    // resetting to the default the moment the session appears.
    const recorded = persistedTier(context);
    if (recorded) tier = recorded;
    else if (tier !== DEFAULT_TIER) pi.appendEntry(TIER_ENTRY, { tier });
    if (!ui.connected) showStatus(context);
    ui.emit("changed", state(context));
  });

  pi.on("model_select", (_event, context) => {
    latest = context;
    if (!ui.connected) showStatus(context);
    ui.emit("changed", state(context));
  });

  pi.on("before_provider_request", (event, context) => {
    latest = context;
    if (!supportsFastServiceTier(context.model)) return;
    return applyServiceTierPayload(event.payload, tier);
  });

  pi.registerCommand("speed", {
    description: "Choose the provider response speed for supported Codex models",
    getArgumentCompletions: (prefix) => {
      const values = ["standard", "fast"].filter((value) => value.startsWith(prefix.toLowerCase()));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, context) => {
      latest = context;
      const requested = asTier(args.trim().toLowerCase());
      if (!requested && args.trim()) {
        context.ui.notify("Use /speed standard or /speed fast.", "warning");
        return;
      }

      const next = requested
        ?? (await context.ui.custom<ServiceTier | undefined>(
          (tui, theme, keybindings, done) => new SpeedPanel(tui, theme, keybindings, context, tier, done),
        ));
      if (!next) return;
      if (next === "fast" && !supportsFastServiceTier(context.model)) {
        context.ui.notify("Fast response speed is only offered on supported Codex models.", "warning");
        return;
      }
      setTier(next, context);
      context.ui.notify(`Response speed: ${tierLabel(next)}`, "info");
    },
  });
}
