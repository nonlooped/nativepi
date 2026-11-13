import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, StarIcon, WarningCircleIcon } from "../../shared/icons.ts";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ModelInfo } from "../../shared/pi-types.ts";
import { modelKey } from "../../shared/messages.ts";
import { thinkingLabel, useAppStore } from "../lib/store.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import BrandIcon from "./BrandIcon.tsx";
import ServiceTierSelector from "./ServiceTierSelector.tsx";

export default function ModelSelector() {
  const models = useAppStore((s) => s.models);
  const model = useAppStore((s) => s.model);
  const setModel = useAppStore((s) => s.setModel);
  const favoriteModels = useAppStore((s) => s.favoriteModels ?? []);
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const openSettings = useAppStore((s) => s.openSettings);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query, scope]);

  function navigateModels(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const fromSearch = event.target === searchRef.current;
    const fromRow = event.target instanceof HTMLElement && event.target.matches("[data-model-choice]");
    if (!fromSearch && !fromRow) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (fromSearch && (event.key === "Home" || event.key === "End")) return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-model-choice]") ?? [])];
    if (!rows.length) return;
    event.preventDefault();
    const current = rows.indexOf(event.target as HTMLButtonElement);
    if (fromRow && event.key === "ArrowUp" && current === 0) {
      searchRef.current?.focus();
      return;
    }
    const index = event.key === "Home" ? 0
      : event.key === "End" || (fromSearch && event.key === "ArrowUp") ? rows.length - 1
      : Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    rows[index]?.focus();
    rows[index]?.scrollIntoView({ block: "nearest" });
  }
  const availableProviders = [...new Set(models.map((item) => item.provider))];
  const favoriteModelKeys = new Set(favoriteModels);
  const providerNames = new Map(providers.map((item) => [item.id, item.name]));
  const label = model ? friendlyModelName(model) : "Model";
  const queryTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

  const visibleModels = models.filter((item) => {
    if (scope === "favorites" && !favoriteModelKeys.has(modelKey(item))) return false;
    if (scope !== "all" && scope !== "favorites" && item.provider !== scope) return false;
    if (!queryTerms.length) return true;
    const providerName = providerNames.get(item.provider) ?? "";
    const searchable = `${item.name ?? item.id} ${item.id} ${item.provider} ${providerName}`.toLocaleLowerCase();
    return queryTerms.every((term) => searchable.includes(term));
  });

  if (models.length === 0 && providersLoaded) {
    const ready = providers.some((item) => item.ready);
    return (
      <Button
        variant="ghost"
        onClick={() => openSettings("Providers")}
        title={ready ? "Your connected providers reported no usable models" : undefined}
        className="px-2 font-normal text-muted-foreground hover:text-foreground"
      >
        <WarningCircleIcon data-icon="inline-start" />
        {ready ? "No models available" : "Connect a provider"}
      </Button>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setQuery("");
        setScope("all");
      }}
    >
      <PopoverTrigger
        disabled={models.length === 0}
        render={
          <Button
            variant="ghost"
            className="min-w-0 max-w-[min(16rem,100%)] justify-start gap-1.5 px-2 font-normal"
          />
        }
        title={models.length === 0 ? "Loading models from Pi…" : "Change model, reasoning, and service tier"}
        aria-label={
          models.length === 0
            ? "Loading models"
            : `Model ${label}, reasoning ${thinkingLabel(thinkingLevel)}. Change model, reasoning, and service tier`
        }
      >
        {model ? <ModelProviderIcon provider={model.provider} /> : null}
        <span className="min-w-0 truncate text-foreground">{models.length === 0 ? "Loading models…" : label}</span>
        {models.length > 0 ? (
          <>
            <span className="text-muted-foreground/50" aria-hidden="true">·</span>
            <span className="shrink-0 text-muted-foreground">{thinkingLabel(thinkingLevel)}</span>
          </>
        ) : null}
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        initialFocus={searchRef}
        onKeyDown={navigateModels}
        className={cn(
          NO_DRAG_REGION,
          "flex max-h-[min(32rem,calc(var(--available-height)-0.75rem))] w-[min(36rem,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden rounded-xl p-0",
        )}
      >
        <PopoverTitle className="sr-only">Choose a model</PopoverTitle>
        <PopoverDescription className="sr-only">
          Search models from every provider and adjust reasoning and service tier.
        </PopoverDescription>

        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <MagnifyingGlassIcon className="shrink-0 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by model or provider…"
            aria-label="Search models"
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring/30 dark:bg-transparent"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {visibleModels.length} {visibleModels.length === 1 ? "model" : "models"}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Filter models" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 p-2 sm:w-36 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
            {[
              { value: "all", label: "All models" },
              { value: "favorites", label: "Favorites" },
              ...availableProviders.map((id) => ({ value: id, label: providerNames.get(id) ?? id })),
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={scope === item.value}
                onClick={() => setScope(item.value)}
                title={item.label}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ",
                  scope === item.value ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.value === "favorites" ? <StarIcon className="size-4 shrink-0" /> : item.value !== "all" ? <ModelProviderIcon provider={item.value} /> : <MagnifyingGlassIcon className="size-4 shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>
          <div ref={listRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-2">
            <ModelList
              visibleModels={visibleModels}
              query={query}
              favoritesOnly={scope === "favorites"}
              model={model}
              favoriteModelKeys={favoriteModelKeys}
              providerNames={providerNames}
              onSelect={(next) => void setModel(next)}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-x-2 gap-y-1 border-t border-border/60 px-2 py-2">
          <ReasoningControl />
          <ServiceTierSelector />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReasoningControl() {
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const thinkingLevels = useAppStore((s) => s.thinkingLevels);
  const loading = useAppStore((s) => s.thinkingLevelsLoading);
  const error = useAppStore((s) => s.thinkingLevelsError);
  const retry = useAppStore((s) => s.refreshThinkingLevels);
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel);
  const options = thinkingLevels.map((level) => ({ value: level, label: thinkingLabel(level) }));

  return (
    <section className="min-w-0 flex-1" aria-label="Reasoning">
      <div className="flex min-h-8 items-center gap-2">
        {!error && thinkingLevels.length > 0 ? (
          <Select
            value={thinkingLevels.includes(thinkingLevel) ? thinkingLevel : null}
            items={options}
            disabled={loading || thinkingLevels.length === 1}
            onValueChange={(level) => {
              if (level && level !== thinkingLevel) void setThinkingLevel(level);
            }}
          >
            <SelectTrigger aria-label="Reasoning effort" title="Reasoning effort" className="h-8 min-w-24 border-0 bg-transparent px-2 text-sm dark:bg-transparent dark:hover:bg-muted">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent side="top" align="end" alignItemWithTrigger={false} className="min-w-36">
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="min-h-8 text-sm">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {error ? (
        <div className="mt-1 flex items-center gap-2">
          <p role="alert" className="min-w-0 flex-1 text-xs text-destructive">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => void retry()}>Retry levels</Button>
        </div>
      ) : thinkingLevels.length === 0 ? (
        <p className="pb-1 text-xs text-muted-foreground">
          {loading ? "Loading this model’s levels…" : "No reasoning levels available."}
        </p>
      ) : null}
    </section>
  );
}

function ModelList({
  visibleModels,
  query,
  favoritesOnly,
  model,
  favoriteModelKeys,
  providerNames,
  onSelect,
}: {
  visibleModels: ModelInfo[];
  query: string;
  favoritesOnly: boolean;
  model?: ModelInfo | null;
  favoriteModelKeys: Set<string>;
  providerNames: Map<string, string>;
  onSelect: (model: ModelInfo) => void;
}) {
  const groups = new Map<string | null, ModelInfo[]>();
  const favorites = visibleModels.filter((candidate) => favoriteModelKeys.has(modelKey(candidate)));
  if (favorites.length) groups.set(null, favorites);
  for (const candidate of visibleModels) {
    if (favoriteModelKeys.has(modelKey(candidate))) continue;
    const group = groups.get(candidate.provider);
    if (group) group.push(candidate);
    else groups.set(candidate.provider, [candidate]);
  }

  if (visibleModels.length > 0) {
    return (
      <div className="space-y-3">
        {[...groups].map(([provider, candidates]) => (
          <section key={provider === null ? "favorites" : `provider:${provider}`} aria-label={provider === null ? "Favorites" : providerNames.get(provider) ?? provider}>
            <div className="flex items-center gap-2.5 px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
              {provider === null ? <StarIcon className="size-4" /> : <ModelProviderIcon provider={provider} />}
              <span className="truncate">{provider === null ? "Favorites" : providerNames.get(provider) ?? provider}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {candidates.map((candidate) => (
                <ModelRow
                  key={modelKey(candidate)}
                  model={candidate}
                  favorite={favoriteModelKeys.has(modelKey(candidate))}
                  selected={isSameModel(candidate, model)}
                  providerName={providerNames.get(candidate.provider) ?? candidate.provider}
                  query={query}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
      {query.trim() ? `No models match “${query.trim()}”.` : favoritesOnly ? "No favorites yet. Star a model to keep it here." : "No models are available."}
    </p>
  );
}

function ModelRow({
  model,
  favorite,
  selected,
  providerName,
  query,
  onSelect,
}: {
  model: ModelInfo;
  favorite: boolean;
  selected: boolean;
  providerName: string;
  query: string;
  onSelect: (model: ModelInfo) => void;
}) {
  const toggleFavoriteModel = useAppStore((s) => s.toggleFavoriteModel);
  const context = modelContext(model);
  const display = friendlyModelName(model);

  return (
    <div
      data-selected-model={selected || undefined}
      className={cn("group/model flex min-h-12 items-stretch rounded-md hover:bg-muted/70", selected && "bg-accent/80")}
    >
      <button
        type="button"
        data-model-choice
        title={`${display} · ${providerName}${context ? ` · ${context} context` : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(model)}
        onKeyDown={(event) => {
          if (event.key.toLocaleLowerCase() !== "f" || event.ctrlKey || event.altKey || event.metaKey) return;
          event.preventDefault();
          toggleFavoriteModel(model);
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-md px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block break-words text-sm leading-snug [overflow-wrap:anywhere]", selected && "font-medium")}>{highlightMatch(display, query)}</span>
          {favorite || context ? (
            <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              {favorite ? <span className="truncate">{providerName}</span> : null}
              {context ? <span className="tabular-nums">{context} context</span> : null}
            </span>
          ) : null}
        </span>
        {selected ? <CheckIcon className="size-4 shrink-0" /> : null}
      </button>
      <button
        type="button"
        aria-label={`${favorite ? "Remove" : "Add"} ${model.name ?? model.id} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
        title={`${favorite ? "Remove from favorites" : "Add to favorites"} (F)`}
        onClick={() => toggleFavoriteModel(model)}
        className={cn(
          "flex w-8 shrink-0 items-center justify-center rounded-r-md text-muted-foreground/40 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset group-hover/model:text-muted-foreground",
          favorite && "text-favorite opacity-100 group-hover/model:text-favorite",
        )}
      >
        <StarIcon weight={favorite ? "fill" : "regular"} />
      </button>
    </div>
  );
}

function friendlyModelName(model: ModelInfo) {
  const name = model.name ?? model.id.split("/").at(-1) ?? model.id;
  const context = modelContext(model);
  if (!context) return name;
  return name.replace(new RegExp(`\\s+${context.replace(".", "\\.")}(?:\\s*ctx)?$`, "i"), "");
}

function modelContext(model: ModelInfo) {
  const size = model.contextWindow;
  if (!size) return "";
  if (size >= 1_000_000) return `${Number((size / 1_000_000).toFixed(1))}M`;
  if (size >= 1_000) return `${Math.round(size / 1_000)}K`;
  return size.toLocaleString();
}

function highlightMatch(value: string, rawQuery: string) {
  const query = rawQuery.trim();
  const index = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (!query || index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded-sm bg-foreground/20 px-0.5 text-inherit ring-1 ring-foreground/10">
        {value.slice(index, index + query.length)}
      </mark>
      {value.slice(index + query.length)}
    </>
  );
}

function ModelProviderIcon({ provider }: { provider: string }) {
  return <BrandIcon name={providerIconName(provider)} size={16} />;
}

function isSameModel(a: ModelInfo, b?: ModelInfo | null) {
  return !!b && a.provider === b.provider && a.id === b.id;
}
