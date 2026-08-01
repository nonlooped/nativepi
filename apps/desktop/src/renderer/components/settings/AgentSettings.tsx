import { useAppStore } from "../../lib/store.ts";
import PiPanel from "./PiPanel.tsx";
import { ChoiceRow, SelectRow, SettingsSection, SwitchRow } from "./rows.tsx";

/**
 * How Pi runs a turn.
 *
 * Everything on this screen is stored by Pi in its own settings file, so a
 * change here is also a change for `pi` in a terminal. The queue modes and the
 * two automatic behaviors reach a running Pi immediately; the rest wait for it
 * to restart, which the panel says when it happens.
 */
export default function AgentSettings() {
  const update = useAppStore((s) => s.updatePiSetting);

  return (
    <PiPanel>
      {(settings) => (
        <>
          <SettingsSection heading="New chats">
            <SelectRow
              label="Reasoning level"
              description="How hard the model thinks before answering, when it supports reasoning."
              value={settings.defaultThinkingLevel}
              options={[
                { value: "", label: "Let the model decide" },
                { value: "off", label: "Off" },
                { value: "minimal", label: "Minimal" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "xhigh", label: "Extra high" },
                { value: "max", label: "Maximum" },
              ]}
              onChange={(value) => void update("defaultThinkingLevel", value)}
            />
            <SwitchRow
              label="Offer skills as commands"
              description="Let skills be invoked directly. The composer's $ menu lists whatever this leaves available."
              checked={settings.enableSkillCommands}
              onChange={(value) => void update("enableSkillCommands", value)}
            />
          </SettingsSection>

          <SettingsSection
            heading="Queued messages"
            description="What happens to messages you send while a turn is already running."
          >
            <ChoiceRow
              label="Steering"
              description="Redirects the run already in progress."
              value={settings.steeringMode}
              options={[
                { value: "one-at-a-time", label: "One at a time" },
                { value: "all", label: "All at once" },
              ]}
              onChange={(value) => void update("steeringMode", value)}
            />
            <ChoiceRow
              label="Follow-ups"
              description="Waits and starts a new turn once the current one finishes."
              value={settings.followUpMode}
              options={[
                { value: "one-at-a-time", label: "One at a time" },
                { value: "all", label: "All at once" },
              ]}
              onChange={(value) => void update("followUpMode", value)}
            />
          </SettingsSection>

          <SettingsSection heading="When a turn goes wrong">
            <SwitchRow
              label="Compact automatically"
              description="Summarize older messages when a chat approaches the model's context limit, instead of failing."
              checked={settings.autoCompaction}
              onChange={(value) => void update("autoCompaction", value)}
            />
            <SwitchRow
              label="Retry failed requests"
              description="Retry a provider error with a backoff before surfacing it. You can always stop a retry from the transcript."
              checked={settings.autoRetry}
              onChange={(value) => void update("autoRetry", value)}
            />
          </SettingsSection>

          <SettingsSection heading="In the transcript">
            <SwitchRow
              label="Hide reasoning"
              description="Leave out the model's thinking blocks and show only its answers and tool activity."
              checked={settings.hideThinkingBlock}
              onChange={(value) => void update("hideThinkingBlock", value)}
            />
            <SwitchRow
              label="Report cache misses"
              description="Tell you when a request missed the provider's prompt cache, which usually means it cost more."
              checked={settings.showCacheMissNotices}
              onChange={(value) => void update("showCacheMissNotices", value)}
            />
          </SettingsSection>
        </>
      )}
    </PiPanel>
  );
}
