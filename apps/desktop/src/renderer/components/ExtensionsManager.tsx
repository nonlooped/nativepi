import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
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

export function canReloadProjectAfterPackageChange(projectDir: string) {
  const { activeProjectPath, conversations } = useAppStore.getState();
  return (
    activeProjectPath === projectDir &&
    !Object.values(conversations).some((conversation) => conversation.projectDir === projectDir && conversation.running)
  );
}

export default function ExtensionsManager() {
  const projectDir = useAppStore((s) => s.activeProjectPath);
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
  const packages: PackageInfo[] | null = listing.data?.packages ?? null;
  const localExtensions = listing.data?.extensions.filter((extension) => extension.origin === "top-level") ?? null;
  const projectTrusted = listing.data?.projectTrusted ?? false;
  const errors = listing.data?.errors ?? [];
  const refresh = listing.reload;

  if (!projectDir) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Open a project to manage its packages.
      </p>
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
      await applyPackageChange(modifiedProjectDir, `${trimmed} installed`);
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
    if (res.ok) await applyPackageChange(modifiedProjectDir, `${pkg.source} removed`);
    else setActionError(res.error ?? "Unable to remove the package. Try again.");
    setBusy(null);
  }

  async function update(pkg: PackageInfo) {
    const modifiedProjectDir = projectDir;
    if (!modifiedProjectDir) return;
    setBusy(pkg.source);
    setActionError(undefined);
    const res = await rpc.request.updatePackage({ projectDir: modifiedProjectDir, source: pkg.source });
    if (res.ok) await applyPackageChange(modifiedProjectDir, `${pkg.source} updated`);
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
    <div className="flex flex-col gap-10">
      <section aria-labelledby="installed-heading" className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="installed-heading" className="font-heading text-sm font-semibold">
            Pi extensions
          </h2>
          <div className="flex-1" />
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
            Install
          </Button>
        </div>

        {/* Collapsed until asked for: a field, a scope and a button standing
            permanently above the list is three controls for something most
            people do twice. */}
        {installing ? (
          <div className="mt-3 flex flex-col gap-2.5 rounded-xl border bg-card/40 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                autoFocus
                value={source}
                onChange={(e) => setSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void install();
                  if (e.key === "Escape") setInstalling(false);
                }}
                placeholder="npm package or git URL"
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

        {actionError ? <p className="mt-3 text-sm text-destructive">{actionError}</p> : null}

        <div className="mt-3 flex flex-col">
          {packages === null || localExtensions === null ? (
            <p className="border-t py-5 text-sm text-muted-foreground">Loading…</p>
          ) : packages.length === 0 && localExtensions.length === 0 ? (
            <p className="border-t py-5 text-sm text-muted-foreground">No extensions installed or found locally.</p>
          ) : (
            <>
              {packages.map((pkg) => (
                <ContextMenu key={`${pkg.scope}:${pkg.source}`}>
                  <ContextMenuTrigger
                    render={<div className="group flex items-center gap-3 border-t py-3 pr-1" />}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{pkg.source}</span>
                        {pkg.filtered ? <Badge variant="secondary">filtered</Badge> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {pkg.scope === "project" ? "This project" : "Your user account"}
                      </span>
                    </div>
                    {busy === pkg.source ? (
                      <CircleNotchIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <div
                        className={cn(
                          HOVER_REVEAL,
                          "flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
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
                          title={`Remove ${pkg.source}`}
                          aria-label={`Remove ${pkg.source}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={() => void navigator.clipboard.writeText(pkg.source)}>
                      Copy source
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!pkg.installedPath}
                      onClick={() => pkg.installedPath && void rpc.request.showInFolder({ path: pkg.installedPath })}
                    >
                      Reveal install folder
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              {localExtensions.map((extension) => (
                <ContextMenu key={extension.path}>
                  <ContextMenuTrigger render={<div className="flex items-center gap-3 border-t py-3 pr-1" />}>
                    <div className="min-w-0 flex-1">
                      <span title={extension.path} className="block truncate text-sm font-medium">
                        {extensionLabel(extension.path)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {extension.scope === "project" ? "This project" : "Your user account"}
                        {extension.enabled ? "" : " · Disabled"}
                      </span>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={() => void navigator.clipboard.writeText(extension.path)}>
                      Copy path
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => void rpc.request.showInFolder({ path: extension.path })}>
                      Reveal in folder
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </>
          )}
        </div>
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
            {pendingRemoval?.scope === "project" ? "this project" : "your user account"}. You can install it again from
            the same source.
          </>
        }
        detail={pendingRemoval?.source}
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
