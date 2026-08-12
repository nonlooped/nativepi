import { useAppStore } from "../../lib/store.ts";
import PiPanel from "./PiPanel.tsx";
import { ChoiceRow, SelectRow, SettingsSection, SwitchRow, TextRow } from "./rows.tsx";

/** The same choices Pi's own settings screen offers for the idle timeout. */
const IDLE_TIMEOUTS = [
  { value: "30000", label: "30 seconds" },
  { value: "60000", label: "1 minute" },
  { value: "120000", label: "2 minutes" },
  { value: "300000", label: "5 minutes" },
  { value: "0", label: "No timeout" },
];

/**
 * The timeout choices, including whatever is currently stored.
 *
 * Pi accepts any duration and this file may have been edited by hand, so a value
 * outside the list is kept and shown rather than silently reading as blank.
 */
function idleTimeoutOptions(current: number): { value: string; label: string }[] {
  const value = String(current);
  if (IDLE_TIMEOUTS.some((option) => option.value === value)) return IDLE_TIMEOUTS;
  return [{ value, label: `${Math.round(current / 1000)} seconds` }, ...IDLE_TIMEOUTS];
}

/**
 * Pi settings that most people never need to touch: how it reaches providers,
 * what it trusts by default, and what it reports back to its authors.
 */
export default function AdvancedSettings() {
  const update = useAppStore((s) => s.updatePiSetting);

  return (
    <PiPanel>
      {(settings) => (
        <>
          <SettingsSection
            heading="Trust"
            description="A project folder can carry its own extensions, skills and settings, which are code that runs with your permissions. Pi asks before loading them."
          >
            <ChoiceRow
              label="New project folders"
              description="What Pi assumes when it opens a folder it has never seen."
              value={settings.defaultProjectTrust}
              options={[
                { value: "ask", label: "Ask" },
                { value: "always", label: "Always trust" },
                { value: "never", label: "Never trust" },
              ]}
              onChange={(value) => void update("defaultProjectTrust", value)}
            />
          </SettingsSection>

          <SettingsSection heading="Models">
            <TextRow
              label="Limit the model list"
              description="One pattern per line, matched against provider/model. Leave empty to offer every model your connected providers expose."
              value={settings.enabledModels}
              placeholder={"anthropic/*\nopenai/gpt-*"}
              multiline
              onCommit={(value) => void update("enabledModels", value)}
            />
          </SettingsSection>

          <SettingsSection heading="Network">
            <SelectRow
              label="Transport"
              description="How Pi streams responses. Leave on automatic unless a network blocks one of them."
              value={settings.transport}
              options={[
                { value: "auto", label: "Automatic" },
                { value: "sse", label: "Server-sent events" },
                { value: "websocket", label: "WebSocket" },
                { value: "websocket-cached", label: "WebSocket (cached)" },
              ]}
              onChange={(value) => void update("transport", value)}
            />
            <SelectRow
              label="Idle timeout"
              description="How long Pi waits on a silent connection before giving up on it. Raise this if long reasoning turns get cut off."
              value={String(settings.httpIdleTimeoutMs)}
              options={idleTimeoutOptions(settings.httpIdleTimeoutMs)}
              onChange={(value) => void update("httpIdleTimeoutMs", Number(value))}
            />
          </SettingsSection>

          <SettingsSection heading="Images">
            <SwitchRow
              label="Allow images"
              description="Let images be attached to messages and read by models that accept them."
              checked={!settings.blockImages}
              onChange={(value) => void update("blockImages", !value)}
            />
            <SwitchRow
              label="Resize before sending"
              description="Shrink large images so they cost fewer tokens."
              checked={settings.autoResizeImages}
              onChange={(value) => void update("autoResizeImages", value)}
              disabled={settings.blockImages}
            />
          </SettingsSection>

          <SettingsSection heading="Packages">
            <TextRow
              label="npm command"
              description="How Pi invokes npm when installing packages. Leave empty for its default."
              value={settings.npmCommand}
              placeholder="npm"
              onCommit={(value) => void update("npmCommand", value)}
            />
          </SettingsSection>

          <SettingsSection
            heading="Warnings"
            description="Notices Pi raises about your own usage."
          >
            <SwitchRow
              label="Warn about extra Anthropic usage"
              description="Tell you when a request will be billed beyond your subscription's included usage."
              checked={settings.warnAnthropicExtraUsage}
              onChange={(value) => void update("warnAnthropicExtraUsage", value)}
            />
          </SettingsSection>

          <SettingsSection
            heading="Pi's telemetry"
            description="NativePi has no product telemetry of its own. These switches belong to Pi and control what Pi reports."
          >
            <SwitchRow
              label="Report package installs"
              description="Let Pi count installs of the packages you add."
              checked={settings.enableInstallTelemetry}
              onChange={(value) => void update("enableInstallTelemetry", value)}
            />
            <SwitchRow
              label="Send usage analytics"
              description="Let Pi report anonymous usage. Turning this on generates an identifier stored in Pi's settings file."
              checked={settings.enableAnalytics}
              onChange={(value) => void update("enableAnalytics", value)}
            />
          </SettingsSection>
        </>
      )}
    </PiPanel>
  );
}
