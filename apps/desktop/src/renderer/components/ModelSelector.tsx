import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, StarIcon, WarningCircleIcon } from "../../shared/icons.ts";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ModelInfo } from "../../shared/pi-types.ts";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";
import { modelKey } from "../../shared/messages.ts";
import { thinkingLabel, useAppStore } from "../lib/store.ts";
import { modelProviders } from "../lib/modelProviders.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { hintFor } from "../lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import BrandIcon from "./BrandIcon.tsx";

export default function ModelSelector() {
  const models = useAppStore((s) => s.models);
  const model = useAppStore((s) => s.model);
  const setModel = useAppStore((s) => s.setModel);
  const favoriteModels = useAppStore((s) => s.favoriteModels ?? []);
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const openSettings = useAppStore((s) => s.openSettings);
  const [query, setQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const favoriteModelKeys = new Set(favoriteModels);
  const providerNames = new Map(providers.map((item) => [item.id, item.name]));
  const label = model ? (model.name ?? model.id) : "Model";
  const availableProviders = modelProviders(providers, models);

  const provider =
    selectedTab ?? armedProvider(model, favoriteModelKeys, favoriteModels.length, availableProviders);

  const visibleModels = models.filter((item) => {
    if (provider === "favorite" && !favoriteModelKeys.has(modelKey(item))) return false;
    if (provider !== "favorite" && item.provider !== provider) return false;
    const providerName = providerNames.get(item.provider) ?? "";
    const haystack = `${item.name ?? item.id} ${item.id} ${item.provider} ${providerName}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  function selectModel(next: ModelInfo) {
    void setModel(next);
  }

  if (models.length === 0 && providersLoaded) {
    const ready = providers.some((item) => item.ready);
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openSettings("Providers")}
        title={ready ? "Your connected providers reported no usable models" : undefined}
        className="h-8 gap-2 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
      >
        <WarningCircleIcon data-icon="inline-start" />
        {ready ? "No models available" : "Connect a provider"}
      </Button>
    );
  }

  return (
    <Menu
      onOpenChange={(open) => {
        if (open) setSelectedTab(null);
        else setQuery("");
      }}
    >
      <MenuTrigger
        disabled={models.length === 0}
        title={models.length === 0 ? "Loading models from Pi…" : "Change model and reasoning"}
        aria-label={
          models.length === 0
            ? "Loading models"
            : `Model ${label}, reasoning ${thinkingLabel(thinkingLevel)}. Change model and reasoning`
        }
        className="flex h-8 min-w-0 max-w-72 items-center gap-1.5 rounded-lg px-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {model ? <ModelProviderIcon provider={model.provider} /> : null}
        <span className="min-w-0 truncate text-foreground">{models.length === 0 ? "Loading models…" : label}</span>
        {models.length > 0 ? (
          <>
            <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">·</span>
            <span className="shrink-0 text-muted-foreground">{thinkingLabel(thinkingLevel)}</span>
          </>
        ) : null}
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup
        side="top"
        className={cn(
          NO_DRAG_REGION,
          "flex h-[min(32rem,72vh)] max-h-[calc(var(--available-height)_-_3rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden p-0",
        )}
      >
        <div className="flex min-h-0 flex-1">
          <ProviderRail provider={provider} providers={availableProviders} onSelect={setSelectedTab} />
          <div className="flex min-w-0 flex-1 flex-col p-2">
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key.length === 1) event.stopPropagation();
                }}
                placeholder="Search models…"
                aria-label="Search models"
                className="border-0 bg-muted pl-9 shadow-none"
              />
            </div>
            <ModelScrollArea provider={provider} model={model}>
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {provider === "favorite" ? "Favorites" : (providers.find((item) => item.id === provider)?.name ?? provider)}
              </p>
              <MenuGroup>
                <ModelList
                  visibleModels={visibleModels}
                  provider={provider}
                  query={query}
                  model={model}
                  favoriteModelKeys={favoriteModelKeys}
                  favoritesEmpty={favoriteModels.length === 0}
                  providerNames={providerNames}
                  onSelect={selectModel}
                />
              </MenuGroup>
            </ModelScrollArea>
          </div>
        </div>
        <ReasoningFooter />
      </MenuPopup>
    </Menu>
  );
}

function ReasoningFooter() {
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const thinkingLevels = useAppStore((s) => s.thinkingLevels);
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const combo = hintFor("cycleThinking", keybindingOverrides);
  const index = thinkingLevels.indexOf(thinkingLevel);
  const clamped = index < 0 ? 0 : index;
  const first = thinkingLevels[0];
  const last = thinkingLevels.at(-1);

  return (
    <div
      className="flex shrink-0 flex-col gap-2.5 border-t bg-muted/40 px-3 py-3"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <BrainIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">Reasoning</p>
        {thinkingLevels.length > 0 ? (
          <p className="shrink-0 text-sm font-medium text-foreground">{thinkingLabel(thinkingLevel)}</p>
        ) : null}
        {combo ? <Kbd className="shrink-0">{combo}</Kbd> : null}
      </div>
      {thinkingLevels.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading this model’s levels…</p>
      ) : thinkingLevels.length === 1 ? (
        <p className="text-xs text-muted-foreground">This model only supports {thinkingLabel(thinkingLevels[0]!)}.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <Slider
              min={0}
              max={thinkingLevels.length - 1}
              step={1}
              largeStep={1}
              value={[clamped]}
              aria-label="Reasoning level"
              aria-valuetext={thinkingLabel(thinkingLevels[clamped] ?? thinkingLevel)}
              onValueChange={(next) => {
                const raw = Array.isArray(next) ? next[0] : next;
                const level = typeof raw === "number" ? thinkingLevels[raw] : undefined;
                if (level) void setThinkingLevel(level);
              }}
            />
            <div className="pointer-events-none absolute inset-x-1.5 top-1/2 flex -translate-y-1/2 justify-between">
              {thinkingLevels.map((level, i) => (
                <span
                  key={level}
                  className={cn(
                    "size-1 rounded-full",
                    i === 0 || i === thinkingLevels.length - 1
                      ? "opacity-0"
                      : i <= clamped
                        ? "bg-primary-foreground/70"
                        : "bg-muted-foreground/45",
                  )}
                />
              ))}
            </div>
          </div>
          {first && last ? (
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <span>{thinkingLabel(first)}</span>
              <span>{thinkingLabel(last)}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ModelScrollArea({
  provider,
  model,
  children,
}: {
  provider: string;
  model?: ModelInfo | null;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector("[data-selected-model]")?.scrollIntoView({ block: "nearest" });
  }, [provider, model?.id, model?.provider]);

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  );
}

function armedProvider(
  model: ModelInfo | null | undefined,
  favoriteModelKeys: Set<string>,
  favoriteCount: number,
  availableProviders: AuthProviderInfo[],
): string {
  if (model && favoriteModelKeys.has(modelKey(model))) return "favorite";
  if (model?.provider) return model.provider;
  if (favoriteCount > 0) return "favorite";
  return availableProviders[0]?.id ?? "favorite";
}

function ProviderRail({
  provider,
  providers,
  onSelect,
}: {
  provider: string;
  providers: AuthProviderInfo[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r py-3 [scrollbar-gutter:stable]">
      <button
        type="button"
        title="Favorites"
        aria-label="Show favorite models"
        aria-pressed={provider === "favorite"}
        onClick={() => onSelect("favorite")}
        className={cn("flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", provider === "favorite" && "bg-accent text-foreground")}
      >
        <StarIcon className="text-favorite" weight={provider === "favorite" ? "fill" : "regular"} />
      </button>
      {providers.map((item) => (
        <button
          type="button"
          key={item.id}
          title={item.name}
          aria-label={`Show ${item.name} models`}
          aria-pressed={provider === item.id}
          onClick={() => onSelect(item.id)}
          className={cn("flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", provider === item.id && "bg-accent text-foreground")}
        >
          <ModelProviderIcon provider={item.id} />
        </button>
      ))}
    </div>
  );
}

function ModelList({
  visibleModels,
  provider,
  query,
  model,
  favoriteModelKeys,
  favoritesEmpty,
  providerNames,
  onSelect,
}: {
  visibleModels: ModelInfo[];
  provider: string;
  query: string;
  model?: ModelInfo | null;
  favoriteModelKeys: Set<string>;
  favoritesEmpty: boolean;
  providerNames: Map<string, string>;
  onSelect: (model: ModelInfo) => void;
}) {
  if (visibleModels.length) {
    return (
      <>
        {visibleModels.map((m) => (
          <ModelRow
            key={`${m.provider}/${m.id}`}
            model={m}
            favorite={favoriteModelKeys.has(modelKey(m))}
            selected={isSameModel(m, model)}
            providerName={providerNames.get(m.provider) ?? m.provider}
            showProvider={provider === "favorite"}
            query={query}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }
  if (provider === "favorite" && favoritesEmpty) {
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
        <StarIcon className="mb-1 text-favorite" />
        <p className="text-sm font-medium">No favorites yet</p>
        <p className="text-sm text-muted-foreground">
          Star a model to pin it here — click the star, or press F on a highlighted row. You can also pick a
          provider from the rail on the left.
        </p>
      </div>
    );
  }
  return (
    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
      {query.trim() ? `No models match “${query.trim()}”.` : "No models available from this provider."}
    </p>
  );
}

function ModelRow({
  model: m,
  favorite,
  selected,
  providerName,
  showProvider,
  query,
  onSelect,
}: {
  model: ModelInfo;
  favorite: boolean;
  selected: boolean;
  providerName: string;
  showProvider: boolean;
  query: string;
  onSelect: (model: ModelInfo) => void;
}) {
  const toggleFavoriteModel = useAppStore((s) => s.toggleFavoriteModel);
  const context = modelContext(m);
  const display = friendlyModelName(m);
  const subtitle = showProvider ? providerName : (m.id !== display ? m.id : "");

  return (
    <MenuItem
      closeOnClick={false}
      onClick={() => onSelect(m)}
      onKeyDown={(event) => {
        if (event.key.toLowerCase() !== "f" || event.ctrlKey || event.altKey || event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        toggleFavoriteModel(m);
      }}
      className={cn("group/model min-h-11 rounded-lg px-3", selected && "bg-accent")}
      data-selected-model={selected || undefined}
    >
      <ModelProviderIcon provider={m.provider} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{highlightMatch(display, query)}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{highlightMatch(subtitle, query)}</p>
        ) : null}
      </div>
      {context ? (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{context}</span>
      ) : null}
      <button
        type="button"
        aria-label={`${favorite ? "Remove" : "Add"} ${m.name ?? m.id} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
        title={`${favorite ? "Remove from favorites" : "Add to favorites"} (F)`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          toggleFavoriteModel(m);
        }}
        className={cn(
          HOVER_REVEAL,
          "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none group-hover/model:scale-100 group-hover/model:opacity-100 group-hover/model:blur-none group-data-[highlighted]/model:scale-100 group-data-[highlighted]/model:opacity-100 group-data-[highlighted]/model:blur-none hover:bg-muted hover:text-foreground focus-visible:scale-100 focus-visible:opacity-100 focus-visible:blur-none focus-visible:ring-2 focus-visible:ring-ring",
          favorite && "scale-100 opacity-100 blur-none",
        )}
      >
        <StarIcon
          className={cn(favorite && "text-favorite")}
          weight={favorite ? "fill" : "regular"}
        />
      </button>
      {selected ? <CheckIcon className="text-success" /> : null}
    </MenuItem>
  );
}

function friendlyModelName(model: ModelInfo): string {
  const name = model.name ?? model.id.split("/").at(-1) ?? model.id;
  const context = modelContext(model);
  if (!context) return name;
  return name.replace(new RegExp(`\\s+${context.replace(".", "\\.")}(?:\\s*ctx)?$`, "i"), "");
}

function modelContext(model: ModelInfo): string {
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
      <mark className="rounded-sm bg-foreground/20 px-0.5 text-inherit ring-1 ring-foreground/10">{value.slice(index, index + query.length)}</mark>
      {value.slice(index + query.length)}
    </>
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

function isSameModel(a: ModelInfo, b?: ModelInfo | null): boolean {
  return !!b && a.provider === b.provider && a.id === b.id;
}
