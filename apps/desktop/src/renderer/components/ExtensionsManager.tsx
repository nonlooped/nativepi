import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import type { PackageInfo } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

export default function ExtensionsManager() {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const reloadExtensions = useAppStore((s) => s.reloadExtensions);
  const graphicalErrors = useAppStore((s) => s.extLoadErrors);

  const [source, setSource] = useState("");
  const [scope, setScope] = useState<"user" | "project">("user");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [pendingRemoval, setPendingRemoval] = useState<PackageInfo | null>(null);

  const listing = useRequest(
    async () => (projectDir ? await rpc.request.listPackages({ projectDir }) : null),
    [projectDir],
  );
  const packages: PackageInfo[] | null = listing.data?.packages ?? null;
  const extCount = listing.data?.extensions.length ?? 0;
  const projectTrusted = listing.data?.projectTrusted ?? false;
  const errors = listing.data?.errors ?? [];
  const refresh = listing.reload;

  if (!projectDir) {
    return (
      <section className="max-w-3xl">
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Open a project to manage its extensions.
        </p>
      </section>
    );
  }

  async function install() {
    const trimmed = source.trim();
    if (!trimmed) return;
    setBusy("install");
    setActionError(undefined);
    const res = await rpc.request.installPackage({ projectDir: projectDir!, source: trimmed, scope });
    setBusy(null);
    if (res.ok) {
      setSource("");
      refresh();
    } else {
      setActionError(res.error ?? "Install failed");
    }
  }

  async function remove(pkg: PackageInfo) {
    setBusy(pkg.source);
    setActionError(undefined);
    const res = await rpc.request.removePackage({ projectDir: projectDir!, source: pkg.source, scope: pkg.scope });
    setBusy(null);
    if (res.ok) refresh();
    else setActionError(res.error ?? "Remove failed");
  }

  async function update(pkg: PackageInfo) {
    setBusy(pkg.source);
    setActionError(undefined);
    const res = await rpc.request.updatePackage({ projectDir: projectDir!, source: pkg.source });
    setBusy(null);
    if (!res.ok) setActionError(res.error ?? "Update failed");
    else refresh();
  }

  async function reload() {
    setBusy("reload");
    await reloadExtensions();
    refresh();
    setBusy(null);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <section aria-labelledby="install-heading">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="install-heading" className="font-heading text-sm font-semibold">
            Install a package
          </h2>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={busy !== null}>
            {busy === "reload" ? (
              <CircleNotchIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <ArrowClockwiseIcon data-icon="inline-start" />
            )}
            Reload extensions
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void install();
            }}
            placeholder="npm package or git URL"
            aria-label="Package source"
          />
          <ScopeToggle scope={scope} setScope={setScope} projectTrusted={projectTrusted} />
          <Button size="xl" className="min-w-24" onClick={() => void install()} disabled={!source.trim() || busy !== null}>
            {busy === "install" ? <CircleNotchIcon className="animate-spin" /> : "Install"}
          </Button>
        </div>

        {actionError ? <p className="mt-3 text-sm text-destructive">{actionError}</p> : null}

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Extensions are trusted code that runs inside Pi with your permissions. Only install sources you recognize.
        </p>
      </section>

      <section aria-labelledby="installed-heading">
        <h2 id="installed-heading" className="mb-1 font-heading text-sm font-semibold">
          Installed
          <span className="ml-2 font-sans text-xs font-normal text-muted-foreground tabular-nums">
            {extCount} loaded
          </span>
        </h2>

        {packages === null ? (
          <p className="border-t py-5 text-sm text-muted-foreground">Loading…</p>
        ) : packages.length === 0 ? (
          <p className="border-t py-5 text-sm text-muted-foreground">No packages installed.</p>
        ) : (
          <div className="flex flex-col">
            {packages.map((pkg) => (
              <div key={`${pkg.scope}:${pkg.source}`} className="flex items-center gap-3 border-t py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{pkg.source}</span>
                    {pkg.filtered ? <Badge>filtered</Badge> : null}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {pkg.scope === "project" ? "Project" : "User"}
                  </span>
                </div>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void update(pkg)}>
                  {busy === pkg.source ? <CircleNotchIcon className="animate-spin" /> : "Update"}
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
            ))}
          </div>
        )}
      </section>

      {graphicalErrors.length > 0 || errors.length > 0 ? (
        <section aria-labelledby="ext-errors-heading">
          <h2 id="ext-errors-heading" className="mb-4 font-heading text-sm font-semibold text-destructive">
            Load errors
          </h2>
          <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{children}</span>;
}

function ScopeToggle({
  scope,
  setScope,
  projectTrusted,
}: {
  scope: "user" | "project";
  setScope: (scope: "user" | "project") => void;
  projectTrusted: boolean;
}) {
  return (
    <div role="group" aria-label="Install scope" className="flex h-10 shrink-0 items-center rounded-md border p-0.5 text-sm">
      <button
        type="button"
        aria-pressed={scope === "user"}
        onClick={() => setScope("user")}
        title="Install for your user account"
        className={cn(
          "rounded-sm px-2.5 py-1.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          scope === "user" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        )}
      >
        User
      </button>
      <button
        type="button"
        aria-pressed={scope === "project"}
        onClick={() => setScope("project")}
        disabled={!projectTrusted}
        title={projectTrusted ? "Install for this project only" : "Trust the project to enable project scope"}
        className={cn(
          "rounded-sm px-2.5 py-1.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
          scope === "project" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        )}
      >
        Project
      </button>
    </div>
  );
}
