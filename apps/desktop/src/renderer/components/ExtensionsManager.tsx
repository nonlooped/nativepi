import SettingsDetails from "./settings/SettingsDetails.tsx";
import { useExtensionManagement } from "../lib/extensionManagement.ts";
import { copyText } from "@/lib/clipboard.ts";
import type { SetupResource } from "../../shared/agent-setup.ts";
import ChatExtensionSettings from "./settings/ChatExtensionSettings.tsx";
import { SettingsEntity, ReadonlyRow } from "./settings/rows.tsx";
import { useState } from "react";
import { CubeIcon } from "@phosphor-icons/react/Cube";
import { FileCodeIcon } from "@phosphor-icons/react/FileCode";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import npmLogo from "material-icon-theme/icons/npm.svg?raw";
import type { PackageInfo } from "../../shared/pi-types.ts";
import { showHint } from "../lib/toast.tsx";
import { useAppStore, usePaneStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import StateNotice from "./StateNotice.tsx";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Segmented } from "./settings/rows.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { ExtensionSettings } from "./ExtensionSlots.tsx";

function extensionLabel(path: string) {
  const parts = path.split(/[\\/]/);
  const filename = parts.pop();
  if (!filename) return path;

  const name = filename.replace(/\.[jt]s$/, "");
  if (name !== "index") return name;

  const extensionsIndex = parts.lastIndexOf("extensions");
  const extensionParts = extensionsIndex === -1 ? parts.slice(-1) : parts.slice(extensionsIndex + 1);
  return extensionParts.join(":") || filename;
}

function packageLabel(source: string) {
  return source.startsWith("npm:") ? source.slice(4) : source;
}

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function PackageSourceIcon({ source }: { source: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
      {source.startsWith("npm:") ? (
        <span
          className="size-4 [&>svg]:size-full"
          // This is a compile-time asset from the pinned Material Icon Theme package.
          dangerouslySetInnerHTML={{ __html: npmLogo }}
        />
      ) : (
        <CubeIcon className="size-4" />
      )}
    </span>
  );
}

function LocalSourceIcon({ source }: { source: string }) {
  const isFile = /\.[cm]?[jt]sx?$/i.test(source);
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
      {isFile ? <FileCodeIcon className="size-4" /> : <FolderIcon className="size-4" weight="fill" />}
    </span>
  );
}

export function canReloadProjectAfterPackageChange(projectDir: string) {
  const { activeProjectPath, conversations } = useAppStore.getState();
  return (
    activeProjectPath === projectDir &&
    !Object.values(conversations).some((conversation) => conversation.projectDir === projectDir && conversation.running)
  );
}

export default function ExtensionsManager({ projectDir: context, resources = [] }: { projectDir?: string; resources?: SetupResource[] } = {}) {
  const useAppStore = usePaneStore();
  const activeProject = useAppStore((s) => s.activeProjectPath);
  const workRoot = useAppStore(s => s.workRoot);
  const projectDir = context ?? activeProject ?? workRoot;
  const [query, setQuery] = useState("");
  const recoveryTarget = useExtensionManagement(s => s.target);
  const clearTarget = () => useExtensionManagement.setState({ target: null });
  const [expanded, setExpanded] = useState<string | null>(null);
  const addProject = useAppStore((s) => s.addProject);
  const reloadExtensions = useAppStore((s) => s.reloadExtensions);
  const graphicalErrors = useAppStore((s) => s.extLoadErrors);
  // Reloading extensions restarts Pi, which ends whatever turn it is in the
  // middle of. Every other route to that restart already waits for the run;
  // this one used to take it out from under the user without a word.


  const running = useAppStore(s => Object.values(s.conversations).some(chat => chat.running));
  const [source, setSource] = useState("");
  const [scope, setScope] = useState<"user" | "project">("user");
  const [installing, setInstalling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [pendingRemoval, setPendingRemoval] = useState<PackageInfo | null>(null);

  const listing = useRequest(
    async () => (projectDir ? await rpc.request.listPackages({ projectDir }) : null),
    [projectDir],
  );
  const packages = listing.data?.packages ?? null;
  const installedPackages = packages?.filter((pkg) => !pkg.local) ?? null;
  const localPackages = packages?.filter((pkg) => pkg.local) ?? null;
  const localExtensions = listing.data?.extensions.filter((extension) => extension.origin === "top-level") ?? null;
  const projectTrusted = listing.data?.projectTrusted ?? false;
  const errors = listing.data?.errors ?? [];
  const refresh = listing.reload;

  if (!projectDir) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">Open a project to manage its packages.</p>
        <Button variant="outline" onClick={() => void addProject()}>
          <FolderOpenIcon data-icon="inline-start" />
          Open project
        </Button>
      </div>
    );
  }

  async function applyPackageChange(modifiedProjectDir: string, message: string) {
    const activeProjectPath = useAppStore.getState().activeProjectPath;
    if (!canReloadProjectAfterPackageChange(modifiedProjectDir)) {
      useAppStore.getState().requirePiRestart();
      if (activeProjectPath === modifiedProjectDir) {
        refresh();
        showHint(`${message}. Restart Pi after the running turns finish.`);
      } else {
        showHint(`${message}. Restart Pi to load the change.`);
      }
      return;
    }
    await reloadExtensions();
    refresh();
    showHint(message);
  }

  async function install() {
    const trimmed = source.trim();
    if (!trimmed) return;
    const modifiedProjectDir = projectDir;
    if (!modifiedProjectDir) return;
    setBusy("install");
    setActionError(undefined);
    try {
      const res = await rpc.request.installPackage({ projectDir: modifiedProjectDir, source: trimmed, scope });
      if (!res.ok) {
        setActionError(res.error ?? "Unable to install the package. Try again.");
        return;
      }
      setSource("");
      setInstalling(false);
      await applyPackageChange(modifiedProjectDir, `${packageLabel(trimmed)} installed`);
    } catch (error) {
      setActionError(actionErrorMessage(error, "Unable to install the package. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(pkg: PackageInfo) {
    const modifiedProjectDir = projectDir;
    if (!modifiedProjectDir) return;
    setBusy(pkg.source);
    setActionError(undefined);
    try {
      const res = await rpc.request.removePackage({ projectDir: modifiedProjectDir, source: pkg.source, scope: pkg.scope });
      if (!res.ok) {
        setActionError(res.error ?? "Unable to remove the package. Try again.");
        return;
      }
      const label = pkg.local ? extensionLabel(pkg.source) : packageLabel(pkg.source);
      await applyPackageChange(modifiedProjectDir, `${label} removed`);
    } catch (error) {
      setActionError(actionErrorMessage(error, "Unable to remove the package. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  async function update(pkg: PackageInfo) {
    const modifiedProjectDir = projectDir;
    if (!modifiedProjectDir || pkg.local) return;
    setBusy(pkg.source);
    setActionError(undefined);
    try {
      const res = await rpc.request.updatePackage({ projectDir: modifiedProjectDir, source: pkg.source });
      if (!res.ok) {
        setActionError(res.error ?? "Unable to update the package. Try again.");
        return;
      }
      await applyPackageChange(modifiedProjectDir, `${packageLabel(pkg.source)} updated`);
    } catch (error) {
      setActionError(actionErrorMessage(error, "Unable to update the package. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  const packageRows = [...(installedPackages ?? []), ...(localPackages ?? [])];
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center gap-2">
      <Input type="search" value={query} onChange={event => { setQuery(event.target.value); clearTarget(); }} aria-label="Search packages" placeholder="Search packages" className="h-8 min-w-32 flex-1" />
      <Button variant="outline" size="sm" onClick={() => { refresh(); }} disabled={busy !== null}>Refresh</Button>
      <Button variant="outline" size="sm" disabled={busy !== null || running} onClick={() => void useAppStore.getState().applyPiSettingsRestart()}>Restart Pi</Button>
      <Button variant="outline" size="sm" onClick={() => setInstalling(!installing)} aria-expanded={installing}><PlusIcon />Install package</Button>
    </div>
    {installing ? <div className="flex flex-col gap-3 rounded-md border border-border/50 p-4">
      <label className="text-sm font-medium" htmlFor="package-source">Package source</label>
      <Input id="package-source" autoFocus value={source} onChange={event => setSource(event.target.value)} placeholder="npm package or Git URL" aria-label="Package source" onKeyDown={event => { if (event.key === "Enter") void install(); }} />
      <div className="flex flex-wrap items-center justify-between gap-3"><Segmented label="Available in" value={scope} onChange={setScope} options={[{ value: "user", label: "All projects" }, { value: "project", label: "This project", disabled: !projectTrusted, title: projectTrusted ? undefined : "Trust this project to install for it alone" }]} />
        <div className="flex gap-2"><Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setInstalling(false)}>Cancel</Button><Button size="sm" disabled={!source.trim() || busy !== null} onClick={() => void install()}>{busy === "install" ? "Installing…" : "Install"}</Button></div>
      </div>
      <p className="text-xs leading-5 text-body-muted-foreground">Packages can run code with your permissions. Only install sources you trust.{!projectTrusted ? " Choose a trusted project to install for that project alone." : ""}</p>
    </div> : null}
    {recoveryTarget ? <p className="text-xs leading-5 text-body-muted-foreground">Managing {recoveryTarget.name}. <Button size="xs" variant="ghost" onClick={clearTarget}>Show all packages</Button></p> : null}
    {actionError ? <StateNotice title="Could not complete the action" detail={actionError} /> : null}
    {listing.error ? <StateNotice title="Could not load packages" detail={listing.error} retry={refresh} /> : packages === null ? <StateNotice loading title="Loading packages…" /> : <>
      {!packageRows.length && !localExtensions?.length ? <p className="py-4 text-sm text-muted-foreground">No packages or local extensions found. Install a package to add capabilities.</p> : null}
      <div>{packageRows.filter(pkg => matches(pkg.source) && (!recoveryTarget || recoveryTarget.id.startsWith(pkg.installedPath ?? pkg.source) || pkg.source.includes(recoveryTarget.name))).map(pkg => {
        const key = `${pkg.scope}:${pkg.source}`;
        const provided = resources.filter(resource => resource.source === pkg.source || !!pkg.installedPath && resource.path.startsWith(pkg.installedPath));
        return <SettingsEntity key={key} name={pkg.local ? extensionLabel(pkg.source) : packageLabel(pkg.source)} icon={pkg.local ? <LocalSourceIcon source={pkg.source} /> : <PackageSourceIcon source={pkg.source} />}
          scope={pkg.scope === "project" ? "This project" : "All projects"} description={pkg.filtered ? "Selected resources only" : pkg.local ? "Local source" : "Installed package"} expanded={expanded === key || !!recoveryTarget} onToggle={() => { clearTarget(); setExpanded(expanded === key ? null : key); }}>
          <ReadonlyRow label="Source" value={pkg.source} />
          {provided.length ? <div className="py-2 text-[0.8125rem] leading-5 text-body-muted-foreground"><p className="font-medium text-foreground">Provides</p>{provided.map(resource => <p key={resource.path}>{resource.name} · {resource.kind === "skill" ? "Skill" : "Prompt"}</p>)}</div> : null}
          <div className="flex flex-wrap gap-2 py-2">
            {!pkg.local ? <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void update(pkg)}>{busy === pkg.source ? "Working…" : "Update"}</Button> : null}
            <Button variant="outline" size="sm" onClick={() => void copyText(pkg.source)}>Copy source</Button>
            {pkg.installedPath ? <Button variant="outline" size="sm" onClick={() => void rpc.request.showInFolder({ path: pkg.installedPath! })}>Show files</Button> : null}
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setPendingRemoval(pkg)}>Remove…</Button>
          </div>
          <ChatExtensionSettings source={pkg.source} />
        </SettingsEntity>;
      })}
      {localExtensions?.filter(extension => matches(extension.path) && (!recoveryTarget || extension.path.startsWith(recoveryTarget.id) || recoveryTarget.id.startsWith(extension.path))).map(extension => <SettingsEntity key={extension.path} name={extensionLabel(extension.path)} icon={<LocalSourceIcon source={extension.path} />} scope={extension.scope === "project" ? "This project" : "All projects"}
        description={extension.enabled ? "Local extension" : "Disabled local extension"} expanded={expanded === extension.path || !!recoveryTarget} onToggle={() => { clearTarget(); setExpanded(expanded === extension.path ? null : extension.path); }}>
        <ReadonlyRow label="Source" value={extension.path} />
        <div className="flex gap-2 py-2"><Button size="sm" variant="outline" onClick={() => void copyText(extension.path)}>Copy path</Button><Button size="sm" variant="outline" onClick={() => void rpc.request.showInFolder({ path: extension.path })}>Show files</Button></div>
        <ChatExtensionSettings source={extension.path} />
      </SettingsEntity>)}
      </div>
      {query.trim() && !packageRows.some(pkg => matches(pkg.source)) && !localExtensions?.some(extension => matches(extension.path)) ? <p role="status" className="text-sm text-muted-foreground">No matching packages.</p> : null}
      {recoveryTarget && !packageRows.some(pkg => recoveryTarget.id.startsWith(pkg.installedPath ?? pkg.source) || pkg.source.includes(recoveryTarget.name)) && !localExtensions?.some(extension => extension.path.startsWith(recoveryTarget.id) || recoveryTarget.id.startsWith(extension.path)) ? <p role="status" className="text-xs text-body-muted-foreground">This extension is no longer in this folder’s package list. Show all packages to check its source or choose another project.</p> : null}
    </>}
    {graphicalErrors.length || errors.length ? <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4"><div className="min-w-0"><p className="text-sm font-medium">Some extensions could not load</p><p className="mt-1 text-[0.8125rem] leading-5 text-body-muted-foreground">Update the affected packages, then reload.</p></div><Button variant="outline" size="sm" disabled={running || busy !== null} onClick={async () => {
        setBusy("reload"); setActionError(undefined);
        try { await reloadExtensions(); refresh(); }
        catch (error) { setActionError(actionErrorMessage(error, "Extensions could not reload.")); }
        finally { setBusy(null); }
      }}>{busy === "reload" ? "Reloading…" : "Reload extensions"}</Button></div>
      {running ? <p className="text-xs text-muted-foreground">Finish running chats before reloading.</p> : null}
      <SettingsDetails id="extension-load-errors" title="Error details" summary={`${errors.length + graphicalErrors.length} load ${errors.length + graphicalErrors.length === 1 ? "error" : "errors"}`}><div className="space-y-3 text-xs leading-5 text-body-muted-foreground">{errors.map((error, i) => <p key={i} className="break-words">{error}</p>)}{graphicalErrors.map(error => <div key={error.name}><p className="font-medium text-foreground">{error.name}</p><p className="mt-1 break-words">{error.error}</p></div>)}<p>A display error can leave the package’s agent tools available.</p></div></SettingsDetails>
    </div> : null}
    <ExtensionSettings />
    <ConfirmDialog open={pendingRemoval !== null} title="Remove this package?" description={<>Pi will no longer load this source for {pendingRemoval?.scope === "project" ? "this project" : "your user account"}. You can install it again from the same source.</>} detail={pendingRemoval?.source} confirmLabel="Remove package" destructive onCancel={() => setPendingRemoval(null)} onConfirm={() => { const target = pendingRemoval; setPendingRemoval(null); if (target) void remove(target); }} />
  </div>;
}
