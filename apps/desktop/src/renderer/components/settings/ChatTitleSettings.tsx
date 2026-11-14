import { useEffect, useState } from "react";
import { chatTitleModelKey, resolveChatTitle, type ChatTitleCatalog } from "../../../shared/chat-title.ts";
import { serviceTierLabels } from "../../../shared/service-tier.ts";
import { useAppStore } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { SelectRow, SettingsSection } from "./rows.tsx";

const label = (value: string) => value === "xhigh" ? "Extra high" : value[0]!.toUpperCase() + value.slice(1);

export default function ChatTitleSettings() {
  const settings = useAppStore(state => state.preferences.chatTitle);
  const setPreference = useAppStore(state => state.setPreference);
  const projectDir = useAppStore(state => state.activeProjectPath);
  const sessionFile = useAppStore(state => state.activeSessionFile);
  const providers = useAppStore(state => state.providers);
  const [catalog, setCatalog] = useState<ChatTitleCatalog | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let disposed = false;
    setCatalog(null); setError(undefined);
    void rpc.request.getChatTitleModels({ ...(projectDir ? { projectDir, sessionFile } : {}) }).then(result => {
      if (disposed) return;
      setCatalog(result); setError(result.error);
    }).catch(() => { if (!disposed) setError("Could not load available models."); });
    return () => { disposed = true; };
  }, [projectDir, sessionFile, providers]);
  const selected = catalog ? resolveChatTitle(settings, catalog) : undefined;
  const automatic = catalog ? resolveChatTitle({ ...settings, reasoning: "auto", serviceTier: "auto" }, catalog) : undefined;
  const modelOptions = [{ value: "auto", label: "Automatic" }, ...(catalog?.models ?? []).map(model => ({
    value: chatTitleModelKey(model), label: `${model.name} · ${model.provider}`,
  }))];
  if (!modelOptions.some(option => option.value === settings.model)) {
    modelOptions.push({ value: settings.model, label: `${settings.model} (unavailable)` });
  }
  const reasoningOptions = [
    { value: "auto", label: automatic ? `Auto (${label(automatic.reasoning)})` : "Auto" },
    ...(selected?.model.thinkingLevels ?? []).map(level => ({ value: level, label: label(level) })),
  ];
  if (!reasoningOptions.some(option => option.value === settings.reasoning)) {
    reasoningOptions.push({ value: settings.reasoning, label: `${label(settings.reasoning)} (unavailable)` });
  }
  const tierOptions = [
    { value: "auto", label: automatic ? `Auto (${serviceTierLabels[automatic.serviceTier]})` : "Auto" },
    { value: "default", label: "Standard" },
    ...(selected?.model.tiers.includes("priority") ? [{ value: "priority", label: "Priority" }] : []),
  ];
  if (!tierOptions.some(option => option.value === settings.serviceTier)) {
    tierOptions.push({ value: settings.serviceTier, label: "Priority (unavailable)" });
  }
  return <SettingsSection heading="Chat titles" description="Name new chats in the background from your first message. These settings are separate from the conversation model.">
    <SelectRow label="Title model" value={settings.model} options={modelOptions}
      description={error ?? (!catalog ? "Loading available models…" : selected
        ? `Uses ${selected.model.name} · ${selected.model.provider}. Automatic prefers Luna, Haiku, Hydrogen, then Grok from connected providers.`
        : settings.model === "auto" ? "Connect a provider to generate titles. Until then, chats use the first message."
        : "This model is unavailable. Chats keep their first-message title until it is available or you choose another model.")}
      onChange={model => setPreference("chatTitle", { ...settings, model })} />
    <SelectRow label="Title reasoning" value={settings.reasoning} options={reasoningOptions} disabled={!selected}
      description={selected && settings.reasoning !== "auto" && selected.reasoning !== settings.reasoning
        ? `This effort is unavailable; uses ${label(selected.reasoning)}.`
        : "Auto uses low reasoning where supported, otherwise the lowest available effort."}
      onChange={reasoning => setPreference("chatTitle", { ...settings, reasoning: reasoning as typeof settings.reasoning })} />
    <SelectRow label="Title service tier" value={settings.serviceTier} options={tierOptions} disabled={!selected}
      description={selected && settings.serviceTier !== "auto" && selected.serviceTier !== settings.serviceTier
        ? "Priority is unavailable for this model; uses Standard."
        : "Auto uses Priority for Luna and Standard otherwise. Priority can increase cost or subscription usage."}
      onChange={serviceTier => setPreference("chatTitle", { ...settings, serviceTier: serviceTier as typeof settings.serviceTier })} />
  </SettingsSection>;
}
