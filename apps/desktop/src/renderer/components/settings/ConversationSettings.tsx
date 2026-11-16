import { useAppStore } from "../../lib/store.ts";
import ChatTitleSettings from "./ChatTitleSettings.tsx";
import { SettingsSection, SwitchRow } from "./rows.tsx";

export default function ConversationSettings() {
  const suggestions = useAppStore(s => s.preferences.promptSuggestions);
  const setPreference = useAppStore(s => s.setPreference);
  return <div className="flex flex-col gap-7">
    <SettingsSection id="suggestions" heading="Replies">
      <SwitchRow label="Suggest next message" description="Offer a reply after Pi finishes. Uses an extra request to your current model."
        checked={suggestions} onChange={value => setPreference("promptSuggestions", value)} />
      <p className="pb-2 text-xs text-muted-foreground">Tab accepts a suggestion. Escape dismisses it.</p>
    </SettingsSection>
    <ChatTitleSettings />
  </div>;
}
