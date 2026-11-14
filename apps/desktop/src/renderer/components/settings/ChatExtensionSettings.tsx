import type { ResolvedExtension } from "../../../shared/pi-types.ts";
import { useRequest } from "../../lib/useRequest.ts";
import StateNotice from "../StateNotice.tsx";
import { useAppStore } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { SettingsSection, SwitchRow } from "./rows.tsx";

export default function ChatExtensionSettings() {
  const root = useAppStore(s => s.chatRoot);
  const enabled = useAppStore(s => s.chatExtensions);
  const setEnabled = useAppStore(s => s.setChatExtensions);
  const request = useRequest(async () => {
    if (!root) throw new Error("Chat workspace is not available. Reopen NativePi to try again.");
    return (await rpc.request.listPackages({ projectDir: root })).extensions;
  }, [root]);
  const extensions = request.data ?? [];
  const groups = new Map<string, ResolvedExtension[]>();
  for (const extension of extensions.filter(e => e.scope === "user")) { const id = extension.origin === "top-level" ? extension.path : extension.source; groups.set(id, [...(groups.get(id) ?? []), extension]); }
  return (
    <SettingsSection
      heading="Extensions in Chat"
      description="Off by default. Enabling an extension gives Chat all of its tools and capabilities. Restart Pi to apply changes to open chats."
    >
      {request.error ? <StateNotice title="Could not load Chat extensions" detail={request.error} retry={request.reload} /> : request.loading ? <StateNotice loading title="Loading Chat extensions…" /> : groups.size === 0 ? (
        <p className="py-2.5 text-xs text-muted-foreground">No user-installed extensions found.</p>
      ) : [...groups].map(([source, entries]) => {
        const name = source.startsWith("npm:") ? source.slice(4) : source.split(/[/\\]/).filter(Boolean).at(-1) ?? source;
        return (
          <SwitchRow
            key={source}
            label={<span title={source} className="truncate">{name}</span>}
            description={entries.length > 1 ? entries.map(entry => entry.path.split(/[/\\]/).pop()).join(", ") : undefined}
            checked={entries.every(entry => enabled.includes(entry.path))}
            onChange={checked => setEnabled(checked
              ? [...new Set([...enabled, ...entries.map(entry => entry.path)])]
              : enabled.filter(path => !entries.some(entry => entry.path === path)))}
          />
        );
      })}
    </SettingsSection>
  );
}
