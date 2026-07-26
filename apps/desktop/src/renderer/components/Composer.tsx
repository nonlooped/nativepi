import { ArrowBendUpRightIcon, CaretDownIcon, CheckIcon, GitBranchIcon, MagnifyingGlassIcon, PaperPlaneRightIcon, PlusIcon, StarIcon, WarningCircleIcon } from "../../shared/icons.ts"
import { useId, useMemo, useState } from "react";
import type { AssistantMessage, GitBranch, ModelInfo } from "../../shared/pi-types.ts";
import { draftKeyFor, modelKey } from "../../shared/messages.ts";
import { thinkingLabel, useAppStore } from "../lib/store.ts";
import { formatTokens } from "../lib/format.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { withHint } from "../lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import { SCROLLBAR_GUTTER_OFFSET, cn } from "@/lib/utils.ts";
import { ComposerWidgets } from "./ExtensionSlots.tsx";
import BrandIcon from "./BrandIcon.tsx";

export default function Composer({ prominent = false }: { prominent?: boolean }) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const draft = useAppStore((s) =>
    activeProjectPath ? (s.drafts[draftKeyFor(activeProjectPath, activeSessionFile)] ?? "") : "",
  );
  const running = useAppStore((s) => s.running);
  const blocked = useAppStore((s) => s.externalChange !== null);
  const setDraft = useAppStore((s) => s.setDraft);
  const send = useAppStore((s) => s.send);
  const enqueue = useAppStore((s) => s.enqueue);
  const behavior = useAppStore((s) => s.sendBehavior);
  const setBehavior = useAppStore((s) => s.setSendBehavior);

  const disabled = !activeProjectPath;
  const canSend = !!draft.trim() && !disabled && !blocked;
  const steering = running && behavior === "steer";

  const submit = () => {
    if (!canSend) return;
    if (running) void enqueue(behavior);
    else void send();
  };

  return (
    <div className={cn("flex shrink-0 flex-col gap-2 px-4 pb-4", prominent ? "w-full p-0" : cn(SCROLLBAR_GUTTER_OFFSET, "pt-2"))}>
      <ExtensionStatuses />
      <ComposerWidgets placement="aboveComposer" />
      <QueuedMessages />
      <div className="composer-surface mx-auto flex w-full max-w-3xl flex-col rounded-3xl bg-card px-3 pb-3 pt-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // isComposing guards IME input: without it, Enter commits a
            // half-composed CJK word instead of accepting the candidate.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={
            disabled
              ? "Open a project to begin"
              : blocked
                ? "This chat changed outside NativePi — reload or duplicate it to continue"
                : running
                  ? "Steer this turn or queue a follow-up…"
                  : "Ask for follow-up changes or attach images"
          }
          disabled={disabled}
          className="max-h-56 min-h-24 resize-none border-0 bg-transparent px-2.5 py-3 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {/* Two groups, not six peers: everything that describes the message on
            the left, the single act of sending it on the right. The context
            readout is a readout, so it belongs with the settings it reports on —
            not wedged between the spacer and Send. Stop is not here at all; it
            acts on the run and lives with the run status above the transcript. */}
        <div className="flex items-center gap-1 px-1">
          <ModelSelector />
          <div className="mx-1 h-5 w-px bg-border" />
          <ThinkingSelector />
          <ContextWindow />
          <BranchSelector />
          <div className="flex-1" />
          {running ? <BehaviorSelector behavior={behavior} setBehavior={setBehavior} /> : null}
          <Button
            size="icon-lg"
            className="rounded-full"
            onClick={submit}
            disabled={!canSend}
            title={steering ? "Steer this turn" : running ? "Queue a follow-up" : "Send message"}
            aria-label={steering ? "Steer this turn" : running ? "Queue a follow-up" : "Send message"}
          >
            {/* Steering redirects the turn in flight; it is not the same act as
                sending, so it does not wear the same glyph. */}
            {steering ? <ArrowBendUpRightIcon weight="bold" /> : <PaperPlaneRightIcon weight="fill" />}
          </Button>
        </div>
      </div>
      <ComposerWidgets placement="belowComposer" />
    </div>
  );
}

function ExtensionStatuses() {
  const statuses = useAppStore((s) => s.extStatuses);
  const entries = Object.entries(statuses);
  if (entries.length === 0) return null;
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {entries.map(([key, text]) => (
        <span key={key} className="truncate">
          {text}
        </span>
      ))}
    </div>
  );
}

function QueuedMessages() {
  const steering = useAppStore((s) => s.queue.steering);
  const followUp = useAppStore((s) => s.queue.followUp);
  if (steering.length === 0 && followUp.length === 0) return null;

  return (
    <div className="mx-auto mb-2 flex max-h-40 w-full max-w-3xl flex-col gap-1 overflow-y-auto">
      {steering.map((text, i) => (
        <QueueRow key={`s${i}`} label="Steer" text={text} />
      ))}
      {followUp.map((text, i) => (
        <QueueRow key={`f${i}`} label="Follow up" text={text} />
      ))}
      {/* Pi owns this queue and exposes no way to withdraw an entry, so say so
          rather than leaving the user hunting for a control that cannot exist. */}
      <p className="px-1 pt-0.5 text-xs text-muted-foreground">
        Queued in Pi. Stopping the turn is the only way to discard these.
      </p>
    </div>
  );
}

function QueueRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border bg-card/60 px-3 py-2 text-sm">
      <span className="mt-0.5 shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {/* Two lines rather than one: a queued message you cannot read back is
          one you cannot verify before it reaches the agent. */}
      <span className="min-w-0 flex-1 line-clamp-2 break-words whitespace-pre-wrap text-muted-foreground" title={text}>
        {text}
      </span>
    </div>
  );
}

function BehaviorSelector({
  behavior,
  setBehavior,
}: {
  behavior: "steer" | "followUp";
  setBehavior: (behavior: "steer" | "followUp") => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Message behaviour: ${behavior === "steer" ? "steer this turn" : "queue a follow-up"}`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{behavior === "steer" ? "Steer" : "Follow up"}</span>
        <CaretDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="w-64 p-1.5">
        <MenuItem onClick={() => setBehavior("steer")} className="items-start gap-2 rounded-md">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Steer</span>
            <span className="text-xs text-muted-foreground">Redirect the current turn now</span>
          </div>
          {behavior === "steer" ? <CheckIcon className="ml-auto mt-0.5 shrink-0" /> : null}
        </MenuItem>
        <MenuItem onClick={() => setBehavior("followUp")} className="items-start gap-2 rounded-md">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Follow up</span>
            <span className="text-xs text-muted-foreground">Run after the current turn settles</span>
          </div>
          {behavior === "followUp" ? <CheckIcon className="ml-auto mt-0.5 shrink-0" /> : null}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function ModelSelector() {
  const models = useAppStore((s) => s.models);
  const model = useAppStore((s) => s.model);
  const favoriteModels = useAppStore((s) => s.favoriteModels ?? []);
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const setModel = useAppStore((s) => s.setModel);
  const toggleFavoriteModel = useAppStore((s) => s.toggleFavoriteModel);
  const openSettings = useAppStore((s) => s.openSettings);
  const [query, setQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const label = model ? (model.name ?? model.id) : "Model";
  const authenticatedProviders = providers.filter((item) => item.configured && models.some((m) => m.provider === item.id));

  const provider =
    selectedTab ?? (favoriteModels.length > 0 ? "favorite" : (authenticatedProviders[0]?.id ?? "favorite"));

  const visibleModels = models.filter((item) => {
    if (provider === "favorite" && !favoriteModels.includes(modelKey(item))) return false;
    if (provider !== "favorite" && item.provider !== provider) return false;
    const providerName = providers.find((p) => p.id === item.provider)?.name ?? "";
    const haystack = `${item.name ?? item.id} ${item.id} ${item.provider} ${providerName}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  if (models.length === 0 && providersLoaded && !providers.some((item) => item.configured)) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={openSettings}
        className="h-8 gap-2 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
      >
        <WarningCircleIcon />
        Connect a provider
      </Button>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        disabled={models.length === 0}
        title={models.length === 0 ? "Loading models from Pi…" : "Change model"}
        className="flex h-8 max-w-56 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {model ? <ModelProviderIcon provider={model.provider} /> : null}
        <span className="truncate">{models.length === 0 ? "Loading models…" : label}</span>
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="h-[min(30rem,70vh)] w-[min(31rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex h-full min-h-0">
          <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r py-3">
            <button
              type="button"
              title="Favorites"
              aria-label="Show favorite models"
              aria-pressed={provider === "favorite"}
              onClick={() => setSelectedTab("favorite")}
              className={cn("flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", provider === "favorite" && "bg-accent text-foreground")}
            >
              <StarIcon className="text-favorite" weight={provider === "favorite" ? "fill" : "regular"} />
            </button>
            {authenticatedProviders.map((item) => (
              <button
                type="button"
                key={item.id}
                title={item.name}
                aria-label={`Show ${item.name} models`}
                aria-pressed={provider === item.id}
                onClick={() => setSelectedTab(item.id)}
                className={cn("flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", provider === item.id && "bg-accent text-foreground")}
              >
                <ModelProviderIcon provider={item.id} />
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col p-2">
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models…"
                aria-label="Search models"
                className="border-0 bg-muted pl-9 shadow-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {provider === "favorite" ? "Favorite" : (providers.find((item) => item.id === provider)?.name ?? provider)}
              </p>
              {visibleModels.length ? visibleModels.map((m) => (
                <MenuItem
                  key={`${m.provider}/${m.id}`}
                  onClick={() => void setModel(m)}
                  // The star is a nested button, which sits outside the menu's
                  // roving tabindex and so cannot be tabbed to. F on the
                  // highlighted row is the keyboard route to the same action —
                  // without it, favorites are mouse-only, and favorites are the
                  // entire mechanism for taming a 40-provider list.
                  onKeyDown={(event) => {
                    if (event.key.toLowerCase() !== "f" || event.ctrlKey || event.altKey || event.metaKey) return;
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavoriteModel(m);
                  }}
                  className={cn("min-h-14 rounded-lg px-3", isSameModel(m, model) && "bg-accent")}
                >
                  <ModelProviderIcon provider={m.provider} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.name ?? m.id}</p>
                    <p className="truncate text-xs text-muted-foreground">{providers.find((item) => item.id === m.provider)?.name ?? m.provider}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${favoriteModels.includes(modelKey(m)) ? "Remove" : "Add"} ${m.name ?? m.id} ${favoriteModels.includes(modelKey(m)) ? "from" : "to"} favorites`}
                    aria-pressed={favoriteModels.includes(modelKey(m))}
                    title={`${favoriteModels.includes(modelKey(m)) ? "Remove from favorites" : "Add to favorites"} (F)`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavoriteModel(m);
                    }}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <StarIcon
                      className={cn(favoriteModels.includes(modelKey(m)) && "text-favorite")}
                      weight={favoriteModels.includes(modelKey(m)) ? "fill" : "regular"}
                    />
                  </button>
                  {isSameModel(m, model) ? <CheckIcon className="text-success" /> : null}
                </MenuItem>
              )) : provider === "favorite" && favoriteModels.length === 0 ? (
                <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
                  <StarIcon className="mb-1 text-favorite" />
                  <p className="text-sm font-medium">No favorites yet</p>
                  <p className="text-sm text-muted-foreground">
                    Star a model to pin it here — click the star, or press F on a highlighted row. You can also pick a
                    provider from the rail on the left.
                  </p>
                </div>
              ) : (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {query.trim() ? `No models match “${query.trim()}”.` : "No models available from this provider."}
                </p>
              )}
            </div>
          </div>
        </div>
      </MenuPopup>
    </Menu>
  );
}

function ModelProviderIcon({ provider }: { provider: string }) {
  return (
    <BrandIcon
      name={providerIconName(provider)}
      size={16}
    />
  );
}

function ThinkingSelector() {
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const thinkingLevels = useAppStore((s) => s.thinkingLevels);
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel);

  return (
    <Menu>
      <MenuTrigger
        title={withHint("How much the model reasons before answering", "cycleThinking")}
        aria-label={`Reasoning level: ${thinkingLabel(thinkingLevel)}`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* "Off" alone is an adjective with no noun: beside a model name it reads
            as if something about the model is switched off. */}
        <span>
          {thinkingLabel(thinkingLevel)}
        </span>
        <CaretDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="w-44 p-1.5">
        <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">Reasoning</p>
        {thinkingLevels.map((level) => (
          <MenuItem
            key={level}
            onClick={() => void setThinkingLevel(level)}
            className={cn("h-9 rounded-md text-sm", level === thinkingLevel && "bg-accent font-medium")}
          >
            {thinkingLabel(level)}
            {level === "medium" ? <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Default</span> : null}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/**
 * Which branch the agent works on, and in which checkout.
 *
 * The destination is a mode over the whole list rather than a submenu per
 * branch: "same branch, different place" is the choice being made, and a mode
 * lets one glance at the list answer "what can I do from here" — a branch held
 * by another worktree can never be checked out, and the branch already open
 * here can never become a new one.
 */
function BranchSelector() {
  const isRepo = useAppStore((s) => s.git?.isRepo ?? false);
  const branch = useAppStore((s) => s.git?.branch);
  const detached = useAppStore((s) => s.git?.detached ?? false);
  const [open, setOpen] = useState(false);

  if (!isRepo) return null;

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        title="Switch branch, or open one in a new worktree"
        aria-label={`Branch: ${detached ? "detached HEAD" : (branch ?? "unknown")}`}
        className="flex h-8 max-w-48 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GitBranchIcon className="shrink-0" />
        <span className="truncate">{detached ? "detached HEAD" : (branch ?? "—")}</span>
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="max-h-none w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0">
        {/* Mounted only while open, so every opening reads the branches fresh —
            the user may have committed or branched in a terminal since. */}
        {open ? <BranchPicker onDone={() => setOpen(false)} /> : null}
      </MenuPopup>
    </Menu>
  );
}

function BranchPicker({ onDone }: { onDone: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const running = useAppStore((s) => s.running);
  const switchBranch = useAppStore((s) => s.switchBranch);
  const branchInWorktree = useAppStore((s) => s.branchInWorktree);
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const [worktree, setWorktree] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useRequest(
    () => rpc.request.gitBranches({ projectDir: projectDir ?? "" }),
    [projectDir],
  );
  const branches = data?.branches ?? [];

  const name = query.trim();
  const matches = branches.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()));
  const canCreate = name.length > 0 && !branches.some((item) => item.name === name);

  async function apply(run: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await run();
    setBusy(false);
    // Left open on failure: Git's refusal (uncommitted changes, an invalid name)
    // is the answer to what the user just tried, and it belongs beside the list
    // they tried it from.
    if (res.ok) onDone();
    else setError(res.error ?? "Git refused this change.");
  }

  function choose(item: GitBranch) {
    if (!worktree) return apply(() => switchBranch(item.name, false));
    if (item.worktree) {
      const path = item.worktree;
      return apply(async () => {
        await openProjectPath(path);
        return { ok: true };
      });
    }
    return apply(() => branchInWorktree(item.name, false));
  }

  return (
    <div className="flex max-h-[min(28rem,70vh)] flex-col">
      <div className="flex flex-col gap-2 border-b p-2">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a branch, or type a new name…"
            aria-label="Find or name a branch"
            className="border-0 bg-muted pl-9 shadow-none"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <DestinationTab active={!worktree} onClick={() => setWorktree(false)} label="This checkout">
            Switch the folder you are working in
          </DestinationTab>
          <DestinationTab active={worktree} onClick={() => setWorktree(true)} label="New worktree">
            Open a second folder, left as it is here
          </DestinationTab>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading branches…</p>
        ) : null}
        {matches.map((item) => {
          // Git enforces one checkout per branch; saying so up front beats
          // letting the click fail with a fatal.
          const blocked = worktree
            ? item.current
              ? "Already checked out here"
              : null
            : item.worktree
              ? "Checked out in another worktree"
              : item.current
                ? "Already on this branch"
                : running
                  ? "Stop the current run before switching branches"
                  : null;

          return (
            <MenuItem
              key={item.name}
              closeOnClick={false}
              disabled={busy || blocked !== null}
              onClick={() => void choose(item)}
              title={blocked ?? item.worktree ?? undefined}
              className={cn("min-h-10 rounded-md px-2.5 text-sm", blocked && "opacity-50")}
            >
              <GitBranchIcon className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {blocked ? (
                <span className="shrink-0 text-xs text-muted-foreground">{blocked}</span>
              ) : worktree && item.worktree ? (
                <span className="shrink-0 text-xs text-muted-foreground">Open worktree</span>
              ) : null}
              {item.current ? <CheckIcon className="shrink-0 text-success" /> : null}
            </MenuItem>
          );
        })}

        {canCreate ? (
          <MenuItem
            closeOnClick={false}
            disabled={busy || (!worktree && running)}
            onClick={() =>
              void apply(() => (worktree ? branchInWorktree(name, true) : switchBranch(name, true)))
            }
            className="min-h-10 rounded-md px-2.5 text-sm"
          >
            <PlusIcon className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              Create <span className="font-medium">{name}</span> {worktree ? "in a new worktree" : "here"}
            </span>
          </MenuItem>
        ) : null}

        {!loading && matches.length === 0 && !canCreate ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No branches yet.</p>
        ) : null}
      </div>

      {error ? (
        <p className="border-t px-3 py-2 text-xs whitespace-pre-wrap text-destructive">{error}</p>
      ) : (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {worktree
            ? "A worktree is a separate folder on the same repository. NativePi opens it as its own project, with its own chats."
            : "Switching moves this project's files. Uncommitted work comes with you."}
        </p>
      )}
    </div>
  );
}

function DestinationTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={children}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-2 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ContextWindow() {
  const entries = useAppStore((s) => s.entries);
  const streaming = useAppStore((s) => s.streaming);
  const model = useAppStore((s) => s.model);
  const [pinned, setPinned] = useState(false);
  const panelId = useId();

  // Walking the whole transcript backwards on every keystroke in the composer is
  // what this used to do; the answer only changes when the transcript does.
  const used = useMemo(() => {
    const live = streaming?.usage?.totalTokens ?? 0;
    if (live) return live;
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      if (entry?.type !== "message") continue;
      const message = entry.message as AssistantMessage;
      if (message.role === "assistant") {
        const total = message.usage?.totalTokens ?? 0;
        if (total) return total;
      }
    }
    return 0;
  }, [entries, streaming]);

  const total = model?.contextWindow ?? 0;
  const percent = total ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="group relative flex size-9 items-center justify-center">
      <button
        type="button"
        // The figure lives in the accessible name, so the ring is not a
        // visual-only readout for anyone who can't see it.
        aria-label={
          total
            ? `Context window ${percent}% used, ${formatTokens(used)} of ${formatTokens(total)} tokens`
            : "Context window usage unavailable"
        }
        aria-expanded={pinned}
        aria-controls={panelId}
        onClick={() => setPinned((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPinned(false);
        }}
        className="flex size-9 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${percent} 100`} className="text-muted-foreground" />
        </svg>
      </button>
      {/*
        Not a live region: this panel is permanently mounted and its numbers
        change on every token, so role="status" made screen readers narrate
        token counts continuously. It is not aria-hidden either — the button
        above claims to expand it, and it holds the only statement anywhere in
        the app that Pi compacts before the model limit.
      */}
      <div
        id={panelId}
        className={cn(
          "pointer-events-none absolute bottom-full right-0 mb-2 hidden w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg group-hover:block group-focus-within:block",
          pinned && "block",
        )}
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold">Context window</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {total ? `${percent}% · ${formatTokens(used)}/${formatTokens(total)}` : "Unavailable"}
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-muted-foreground transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Pi automatically compacts the conversation before it reaches the model limit.
        </p>
      </div>
    </div>
  );
}

function isSameModel(a: ModelInfo, b?: ModelInfo): boolean {
  return !!b && a.provider === b.provider && a.id === b.id;
}
