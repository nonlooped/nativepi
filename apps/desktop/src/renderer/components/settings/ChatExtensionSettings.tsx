import { useEffect, useState } from "react";
import { useAppStore } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { SettingsSection, SwitchRow } from "./rows.tsx";
import type { ResolvedExtension } from "../../../shared/pi-types.ts";

export default function ChatExtensionSettings() {
  const root = useAppStore(s => s.chatRoot);
  const enabled = useAppStore(s => s.chatExtensions);
  const setEnabled = useAppStore(s => s.setChatExtensions);
  const [extensions, setExtensions] = useState<ResolvedExtension[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    if (root) void rpc.request.listPackages({ projectDir: root }).then(result => { if (current) setExtensions(result.extensions); }).catch(() => { if (current) setError("Could not load installed extensions."); });
    return () => { current = false; };
  }, [root]);
  const groups = new Map<string, ResolvedExtension[]>();
  for (const extension of extensions.filter(e => e.scope === "user")) { const id = extension.origin === "top-level" ? extension.path : extension.source; groups.set(id, [...(groups.get(id) ?? []), extension]); }
  return <SettingsSection heading="Extensions in Chat" description="Off by default. Enabling an extension gives Chat all of its tools and capabilities. Restart Pi to apply changes to open chats.">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {groups.size === 0 ? <p className="text-sm text-muted-foreground">No user-installed extensions found.</p> : [...groups].map(([source, entries]) => <SwitchRow key={source} label={source} description={entries.map(e => e.path.split(/[/\\]/).pop()).join(", ")} checked={entries.every(e => enabled.includes(e.path))} onChange={checked => setEnabled(checked ? [...new Set([...enabled, ...entries.map(e => e.path)])] : enabled.filter(path => !entries.some(e => e.path === path)))} />)}
  </SettingsSection>;
}
