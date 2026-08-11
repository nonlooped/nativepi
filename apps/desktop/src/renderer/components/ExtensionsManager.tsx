import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CubeIcon } from "@phosphor-icons/react/Cube";
import { FileCodeIcon } from "@phosphor-icons/react/FileCode";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import npmLogo from "material-icon-theme/icons/npm.svg?raw";
import type { PackageInfo } from "../../shared/pi-types.ts";
import { showHint } from "../lib/toast.tsx";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { HOVER_REVEAL, cn } from "@/lib/utils.ts";
import { Segmented } from "./settings/rows.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";

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

function scopeLabel(scope: string) {
  return scope === "project" ? "Project" : "User";
}

function PackageSourceIcon({ source }: { source: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
      {source.startsWith("npm:") ? (
        <span
          className="size-5 [&>svg]:size-full"
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
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
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

export default function ExtensionsManager() {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const addProject = useAppStore((s) => s.addProject);
  const reloadExtensions = useAppStore((s) => s.reloadExtensions);
  const graphicalErrors = useAppStore((s) => s.extLoadErrors);
  // Reloading extensions restarts Pi, which ends whatever turn it is in the
  // middle of. Every other route to that restart already waits for the run;
  // this one used to take it out from under the user without a word.
  const hasRunningTurns = useAppStore((s) => Object.values(s.conversations).some((conversation) => conversation.running));

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
      if (activeProjectPath === modifiedProjectDir) {
        refresh();
        showHint(`${message}. Reload after the running turns finish.`);
      } else {
        showHint(`${message}. Reload Pi when you return to that project.`);
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
    const res = await rpc.request.installPackage({ projectDir: modifiedProjectDir, source: trimmed, scope });
    if (res.ok) {
      setSource("");
      setInstalling(false);
      await applyPackageChange(modifiedProjectDir, `${packageLabel(trimmed)} installed`);
    } else {
      setActionError(res.error ?? "Unable to install the package. Try again.");
    }
    setBusy(null);
  }

  async function remove(pkg: PackageInfo) {
    const modifiedProjectDir = projectDir;
    if (!modifiedProjectDir) return;
    setBusy(pkg.source);
    setActionError(undefined);
    const res = await rpc.request.removePackage({ projectDir: modifiedProjectDir, source: pkg.source, scope: pkg.scope });
    if (res.ok) {
      const label = pkg.local ? extensionLabel(pkg.source) : packageLabel(pkg.source);
      await applyPackageChange(modifiedProjectDir, `${label} removed`);
    }
    else setActionError(res.error ?? "Unable to remove the package. Try again.");
    setBusy(null);
  }

  async function update(pkg: PackageInfo) {
    const modifiedProjectDir = projectDir;
    if (!modifiedProjectDir || pkg.local) return;
    setBusy(pkg.source);
    setActionError(undefined);
    const res = await rpc.request.updatePackage({ projectDir: modifiedProjectDir, source: pkg.source });
    if (res.ok) await applyPackageChange(modifiedProjectDir, `${packageLabel(pkg.source)} updated`);
    else setActionError(res.error ?? "Unable to update the package. Try again.");
    setBusy(null);
  }

  async function reload() {
    setBusy("reload");
    await reloadExtensions();
    refresh();
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="installed-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h2 id="installed-heading" className="font-heading text-sm font-semibold">
                Installed packages
              </h2>
              {installedPackages ? <Badge variant="secondary">{installedPackages.length}</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">Packages added from npm or Git.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload()}
            disabled={busy !== null || hasRunningTurns}
            title={
              hasRunningTurns
                ? "Wait for every running turn to finish — reloading restarts Pi"
                : "Restart Pi so it picks up changed extensions"
            }
          >
            {busy === "reload" ? (
              <CircleNotchIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <ArrowClockwiseIcon data-icon="inline-start" />
            )}
            Reload
          </Button>
          <Button
            variant={installing ? "secondary" : "outline"}
            size="sm"
            aria-expanded={installing}
            onClick={() => setInstalling((open) => !open)}
          >
            <PlusIcon data-icon="inline-start" />
            Install package
          </Button>
        </div>

        {installing ? (
          <div className="flex flex-col gap-2.5 rounded-xl border bg-card/40 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                autoFocus
                value={source}
                onChange={(e) => setSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void install();
                  if (e.key === "Escape") setInstalling(false);
                }}
                placeholder="npm package or Git URL"
                aria-label="Package source"
                className="min-w-0 flex-1"
              />
              <div className="flex items-center gap-2">
                <Segmented
                  label="Install for"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: "user", label: "User" },
                    {
                      value: "project",
                      label: "Project",
                      disabled: !projectTrusted,
                      title: projectTrusted ? undefined : "Trust this project to install for it alone",
                    },
                  ]}
                />
                <Button size="xl" className="min-w-24" onClick={() => void install()} disabled={!source.trim() || busy !== null}>
                  {busy === "install" ? <CircleNotchIcon className="animate-spin" /> : "Install"}
                </Button>
              </div>
            </div>
            <p className="text-sm leading-5 text-muted-foreground">
              Extensions are trusted code that runs inside Pi with your permissions. Only install sources you recognize.
              {projectTrusted ? "" : " Trust this project to install for it alone."}
            </p>
          </div>
        ) : null}

        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        {installedPackages === null ? (
          <p className="rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground">Loading…</p>
        ) : installedPackages.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground">
            No npm or Git packages installed.
          </p>
        ) : (
          <div className="rounded-lg border bg-card/30 px-3">
            {installedPackages.map((pkg) => (
              <ContextMenu key={`${pkg.scope}:${pkg.source}`}>
                <ContextMenuTrigger render={<div className="group flex min-h-14 items-center gap-3 border-b py-2.5 last:border-b-0" />}>
                  <PackageSourceIcon source={pkg.source} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{packageLabel(pkg.source)}</span>
                      <Badge variant="outline">{scopeLabel(pkg.scope)}</Badge>
                      {pkg.filtered ? <Badge variant="secondary">Filtered</Badge> : null}
                    </div>
                  </div>
                  {busy === pkg.source ? (
                    <CircleNotchIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <div
                      className={cn(
                        HOVER_REVEAL,
                        "flex shrink-0 items-center gap-1 group-focus-within:scale-100 group-focus-within:opacity-100 group-focus-within:blur-none group-hover:scale-100 group-hover:opacity-100 group-hover:blur-none",
                      )}
                    >
                      <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void update(pkg)}>
                        Update
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy !== null}
                        onClick={() => setPendingRemoval(pkg)}
                        title={`Remove ${packageLabel(pkg.source)}`}
                        aria-label={`Remove ${packageLabel(pkg.source)}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  )}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => void navigator.clipboard.writeText(pkg.source)}>Copy source</ContextMenuItem>
                  <ContextMenuItem
                    disabled={!pkg.installedPath}
                    onClick={() => pkg.installedPath && void rpc.request.showInFolder({ path: pkg.installedPath })}
                  >
                    Reveal install folder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="local-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 id="local-heading" className="font-heading text-sm font-semibold">
              Local extensions
            </h2>
            {localPackages && localExtensions ? (
              <Badge variant="secondary">{localPackages.length + localExtensions.length}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Extensions loaded directly from files and folders on this computer.</p>
        </div>

        {localPackages === null || localExtensions === null ? (
          <p className="rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground">Loading…</p>
        ) : localPackages.length === 0 && localExtensions.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground">No local extensions found.</p>
        ) : (
          <div className="rounded-lg border bg-card/30 px-3">
            {localPackages.map((pkg) => (
              <ContextMenu key={`${pkg.scope}:${pkg.source}`}>
                <ContextMenuTrigger render={<div className="group flex min-h-12 items-center gap-3 border-b py-2 last:border-b-0" />}>
                  <LocalSourceIcon source={pkg.source} />
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span title={pkg.source} className="truncate text-sm font-medium">
                      {extensionLabel(pkg.source)}
                    </span>
                    <Badge variant="outline">{scopeLabel(pkg.scope)}</Badge>
                    {pkg.filtered ? <Badge variant="secondary">Filtered</Badge> : null}
                  </div>
                  {busy === pkg.source ? (
                    <CircleNotchIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy !== null}
                      onClick={() => setPendingRemoval(pkg)}
                      title={`Remove ${extensionLabel(pkg.source)}`}
                      aria-label={`Remove ${extensionLabel(pkg.source)}`}
                      className={cn(
                        HOVER_REVEAL,
                        "shrink-0 text-muted-foreground group-focus-within:scale-100 group-focus-within:opacity-100 group-focus-within:blur-none group-hover:scale-100 group-hover:opacity-100 group-hover:blur-none hover:text-destructive",
                      )}
                    >
                      <TrashIcon />
                    </Button>
                  )}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => void navigator.clipboard.writeText(pkg.source)}>Copy path</ContextMenuItem>
                  <ContextMenuItem
                    disabled={!pkg.installedPath}
                    onClick={() => pkg.installedPath && void rpc.request.showInFolder({ path: pkg.installedPath })}
                  >
                    Reveal in folder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {localExtensions.map((extension) => (
              <ContextMenu key={extension.path}>
                <ContextMenuTrigger render={<div className="flex min-h-12 items-center gap-3 border-b py-2 last:border-b-0" />}>
                  <LocalSourceIcon source={extension.path} />
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span title={extension.path} className="truncate text-sm font-medium">
                      {extensionLabel(extension.path)}
                    </span>
                    <Badge variant="outline">{scopeLabel(extension.scope)}</Badge>
                    {!extension.enabled ? <Badge variant="secondary">Disabled</Badge> : null}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => void navigator.clipboard.writeText(extension.path)}>Copy path</ContextMenuItem>
                  <ContextMenuItem onClick={() => void rpc.request.showInFolder({ path: extension.path })}>
                    Reveal in folder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </section>

      {graphicalErrors.length > 0 || errors.length > 0 ? (
        <section aria-labelledby="ext-errors-heading" className="flex flex-col gap-2">
          <h2 id="ext-errors-heading" className="flex items-center gap-1.5 font-heading text-sm font-semibold text-destructive">
            <WarningCircleIcon weight="fill" />
            Load errors
          </h2>
          <div className="flex flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errors.map((e, i) => (
              <p key={`s${i}`} className="break-words">
                {e}
              </p>
            ))}
            {graphicalErrors.map((e, i) => (
              <p key={`g${i}`} className="break-words">
                <span className="font-medium">{e.name}:</span> {e.error}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this extension?"
        description={
          <>
            Pi will no longer load this package for{" "}
            {pendingRemoval?.scope === "project" ? "this project" : "your user account"}. You can add it again from the
            same source.
          </>
        }
        detail={
          pendingRemoval
            ? pendingRemoval.local
              ? extensionLabel(pendingRemoval.source)
              : packageLabel(pendingRemoval.source)
            : undefined
        }
        confirmLabel="Remove extension"
        destructive
        onConfirm={() => {
          const target = pendingRemoval;
          setPendingRemoval(null);
          if (target) void remove(target);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
