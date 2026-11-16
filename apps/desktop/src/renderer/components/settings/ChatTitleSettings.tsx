import { useEffect, useState } from "react";
import { resolveChatTitle, type ChatTitleCatalog, type ChatTitleSettings as TitleSettings } from "../../../shared/chat-title.ts";
import { useAppStore, usePaneStore, thinkingLabel } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { serviceTierLabels } from "../../../shared/service-tier.ts";
import ModelSelector from "../ModelSelector.tsx";
import { ActionRow, SettingsSection } from "./rows.tsx";

export default function ChatTitleSettings() {
  const store = usePaneStore();
  const settings = useAppStore(s => s.preferences.chatTitle);
  const setPreference = useAppStore(s => s.setPreference);
  const projectDir = useAppStore(s => s.activeProjectPath);
  const sessionFile = useAppStore(s => s.activeSessionFile);
  const providers = useAppStore(s => s.providers);
  const [catalog, setCatalog] = useState<ChatTitleCatalog | null>(null);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    setCatalog(null); setError(undefined);
    void rpc.request.getChatTitleModels({ ...(projectDir ? { projectDir, sessionFile } : {}) }).then(result => {
      if (!disposed) { setCatalog(result); setError(result.error); }
    }).catch(() => { if (!disposed) setError("Could not load available models."); });
    return () => { disposed = true; };
  }, [projectDir, sessionFile, providers, retry]);
  const selected = catalog ? resolveChatTitle(settings, catalog) : undefined;
  const automatic = catalog ? resolveChatTitle({ ...settings, reasoning: "auto", serviceTier: "auto" }, catalog) : undefined;
  const unavailable = !!catalog && settings.model !== "auto" && !selected;
  const fallback = settings.model === "auto" ? null : settings.model.split("/");
  const description = error ?? (!catalog ? "Loading available models…" : selected
    ? `Uses ${selected.model.name} · ${thinkingLabel(selected.reasoning)} · ${serviceTierLabels[selected.serviceTier]}.`
    : unavailable ? `${settings.model} is unavailable. Keeps the first-message title until you choose another model.`
    : "Connect a provider to generate titles. Until then, chats use the first message.");
  function change(field: "model" | "reasoning" | "tier", value: string) {
    const current = store.getState().preferences.chatTitle;
    setPreference("chatTitle", { ...current, [field === "tier" ? "serviceTier" : field]: value } as TitleSettings);
  }
  return <SettingsSection id="titles" heading="Chat titles">
    <ActionRow label="Title generation" description="Name new chats from the first message using a separate background model.">
      <ModelSelector selection={{
        models: catalog?.models ?? [], loading: !catalog && !error, error,
        retry: () => setRetry(value => value + 1),
        configuration: {
          provider: selected?.model.provider ?? fallback?.[0] ?? "",
          model: selected?.model.id ?? fallback?.slice(1).join("/") ?? "",
          reasoning: selected?.reasoning ?? "off", tier: selected?.serviceTier ?? "default", tools: [],
        },
        onChange: configuration => setPreference("chatTitle", {
          model: `${configuration.provider}/${configuration.model}`, reasoning: configuration.reasoning, serviceTier: configuration.tier ?? "default",
        }),
        automatic: {
          model: settings.model === "auto", reasoning: settings.reasoning === "auto", tier: settings.serviceTier === "auto",
          reasoningLabel: automatic ? `Auto (${thinkingLabel(automatic.reasoning)})` : "Auto",
          tierLabel: automatic ? `Auto (${serviceTierLabels[automatic.serviceTier]})` : "Auto",
          onChange: change,
        },
      }} />
    </ActionRow>
    <p role={error || unavailable ? "alert" : "status"} className="pb-2 text-xs leading-5 text-muted-foreground">{description}</p>
    {selected && settings.reasoning !== "auto" && selected.reasoning !== settings.reasoning ? <p className="pb-2 text-xs text-warning">Saved reasoning {thinkingLabel(settings.reasoning)} is unavailable; uses {thinkingLabel(selected.reasoning)}.</p> : null}
    {selected && settings.serviceTier !== "auto" && selected.serviceTier !== settings.serviceTier ? <p className="pb-2 text-xs text-warning">Priority is unavailable; uses Standard.</p> : null}
  </SettingsSection>;
}
