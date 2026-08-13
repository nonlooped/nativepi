import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CaretDownIcon, CheckIcon, GitBranchIcon, PlusIcon } from "../../shared/icons.ts";
import { filterBranches } from "../lib/branches.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Input } from "@/components/ui/input.tsx";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";

export default function BranchSwitcher({
  className,
  side = "bottom",
}: {
  className?: string;
  side?: "top" | "bottom";
}) {
  const isRepo = useAppStore((s) => s.git?.isRepo ?? false);
  const branch = useAppStore((s) => s.git?.branch);
  const detached = useAppStore((s) => s.git?.detached ?? false);
  const running = useAppStore((s) => Object.values(s.conversations)
    .some((conversation) => conversation.projectDir === s.activeProjectPath && conversation.running));
  const branchMenuRequested = useAppStore((s) => s.branchMenuRequested);
  const consumeBranchMenuRequest = useAppStore((s) => s.consumeBranchMenuRequest);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!branchMenuRequested) return;
    consumeBranchMenuRequest();
    setOpen(true);
  }, [branchMenuRequested, consumeBranchMenuRequest]);

  if (!isRepo) return null;

  const label = detached ? "No branch (detached)" : (branch ?? "—");

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        disabled={running}
        title={running ? "Stop the current run before switching branches" : "Switch branch"}
        aria-label={`Branch: ${label}`}
        className={cn(
          "flex h-8 min-w-0 max-w-48 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          className,
        )}
      >
        <GitBranchIcon className="shrink-0" />
        <span className="truncate">{label}</span>
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side={side} className="max-h-none w-[min(20rem,calc(100vw-2rem))] overflow-hidden p-0">
        {open ? <BranchList onDone={() => setOpen(false)} /> : null}
      </MenuPopup>
    </Menu>
  );
}

function BranchList({ onDone }: { onDone: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const switchBranch = useAppStore((s) => s.switchBranch);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, error: unread, loading } = useRequest(
    () => rpc.request.gitBranches({ projectDir: projectDir ?? "" }),
    [projectDir],
  );
  const branches = data?.branches ?? [];
  const { name, matches, canCreate } = filterBranches(branches, query);

  async function go(branch: string, create: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await switchBranch(branch, create);
      if (res.ok) onDone();
      else setError(res.error ?? "Unable to switch branches. Check that the working tree is clean, then try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-h-[min(24rem,60vh)] flex-col">
      <div className="p-1.5 pb-0">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !name) return;
            event.preventDefault();
            if (canCreate) {
              void go(name, true);
              return;
            }
            const target = matches.find((item) => !item.current && !item.worktree);
            if (target) void go(target.name, false);
          }}
          placeholder="Switch to or create a branch…"
          aria-label="Switch to or create a branch"
          className="h-8 border-0 bg-muted text-sm shadow-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
            <CircleNotchIcon className="mr-1.5 inline animate-spin align-[-2px]" />
            Loading branches…
          </p>
        ) : null}
        <MenuGroup>
        {matches.map((item) => {
          const held = !item.current && item.worktree;
          return (
            <MenuItem
              key={item.name}
              closeOnClick={false}
              disabled={busy || item.current || !!held}
              onClick={() => void go(item.name, false)}
              title={held ? `Checked out in ${held}` : undefined}
              className={cn("min-h-9 rounded-md px-2.5 text-sm", (item.current || held) && "opacity-60")}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {held ? <span className="shrink-0 text-xs text-muted-foreground">in worktree</span> : null}
              {item.current ? <CheckIcon className="shrink-0 text-success" /> : null}
            </MenuItem>
          );
        })}
        {canCreate ? (
          <MenuItem
            closeOnClick={false}
            disabled={busy}
            onClick={() => void go(name, true)}
            className="min-h-9 rounded-md px-2.5 text-sm"
          >
            <PlusIcon className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              Create <span className="font-medium">{name}</span>
            </span>
          </MenuItem>
        ) : null}
        </MenuGroup>
        {unread ? (
          <p className="px-2.5 py-6 text-center text-sm text-destructive">Unable to read this repository's branches. Close and reopen the branch menu to try again.</p>
        ) : !loading && matches.length === 0 && !canCreate ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">No branches yet.</p>
        ) : null}
      </div>
      {error ? (
        <p className="border-t px-3 py-2 text-xs whitespace-pre-wrap text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
