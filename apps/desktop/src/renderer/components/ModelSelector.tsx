import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, StarIcon, WarningCircleIcon } from "../../shared/icons.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ModelInfo } from "../../shared/pi-types.ts";
import { modelKey } from "../../shared/messages.ts";
import { thinkingLabel, useAppStore } from "../lib/store.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { hintFor } from "../lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const favoriteModelKeys = new Set(favoriteModels);
  const providerNames = new Map(providers.map((item) => [item.id, item.name]));
  const label = model ? friendlyModelName(model) : "Model";
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleModels = models.filter((item) => {
    if (!normalizedQuery) return true;
    const providerName = providerNames.get(item.provider) ?? "";
    return `${item.name ?? item.id} ${item.id} ${item.provider} ${providerName}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
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
      }}
    >
      <PopoverTrigger
        disabled={models.length === 0}
        render={
          <Button
            variant="ghost"
            className="min-w-0 max-w-64 justify-start gap-1.5 px-2 font-normal"
          />
        }
        title={models.length === 0 ? "Loading models from Pi…" : "Change model and reasoning"}
        aria-label={
          models.length === 0
            ? "Loading models"
            : `Model ${label}, reasoning ${thinkingLabel(thinkingLevel)}. Change model and reasoning`
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
        sideOffset={6}
        className={cn(
          NO_DRAG_REGION,
          "flex h-[min(23rem,calc(var(--available-height)-0.75rem))] w-[min(22rem,calc(100vw-0.75rem))] gap-0 overflow-hidden p-0",
        )}
      >
        <PopoverTitle className="sr-only">Choose a model</PopoverTitle>
        <PopoverDescription className="sr-only">
          Search models from every provider and adjust reasoning effort.
        </PopoverDescription>

        <div className="shrink-0 border-b border-border/70 p-2.5">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search all models"
              aria-label="Search models"
              className="h-8 pl-8"
            />
          </div>
        </div>

        <ModelScrollArea model={model}>
          <ModelList
            visibleModels={visibleModels}
            query={query}
            model={model}
            favoriteModelKeys={favoriteModelKeys}
            providerNames={providerNames}
            onSelect={(next) => void setModel(next)}
          />
        </ModelScrollArea>

        <ReasoningSlider />
      </PopoverContent>
    </Popover>
  );
}

function ReasoningSlider() {
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const thinkingLevels = useAppStore((s) => s.thinkingLevels);
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const combo = hintFor("cycleThinking", keybindingOverrides);
  const index = thinkingLevels.indexOf(thinkingLevel);
  const selectedIndex = index < 0 ? 0 : index;
  const selectedLevel = thinkingLevels[selectedIndex] ?? thinkingLevel;

  return (
    <section className="shrink-0 border-t border-border/70 px-3 py-2.5" aria-labelledby="reasoning-heading">
      <div className="flex items-center gap-2">
        <h3 id="reasoning-heading" className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          Reasoning effort
        </h3>
        {thinkingLevels.length > 0 ? (
          <span className="shrink-0 text-xs font-medium text-foreground">{thinkingLabel(selectedLevel)}</span>
        ) : null}
        {combo ? <Kbd className="shrink-0">{combo}</Kbd> : null}
      </div>
      {thinkingLevels.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading this model’s levels…</p>
      ) : thinkingLevels.length === 1 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This model uses {thinkingLabel(thinkingLevels[0]!)} reasoning.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1">
          <div className="relative px-0.5">
            <Slider
              min={0}
              max={thinkingLevels.length - 1}
              step={1}
              largeStep={1}
              value={[selectedIndex]}
              aria-label="Reasoning effort"
              className="[&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-track]]:bg-linear-to-r [&_[data-slot=slider-track]]:from-success [&_[data-slot=slider-track]]:to-info"
              onValueChange={(value) => {
                const nextIndex = Array.isArray(value) ? value[0] : value;
                const level = typeof nextIndex === "number" ? thinkingLevels[nextIndex] : undefined;
                if (level && level !== thinkingLevel) void setThinkingLevel(level);
              }}
            />
            <div className="pointer-events-none absolute inset-x-1.5 top-1/2 flex -translate-y-1/2 justify-between" aria-hidden="true">
              {thinkingLevels.map((level, levelIndex) => (
                <span
                  key={level}
                  className={cn(
                    "size-1 rounded-full bg-background/70",
                    (levelIndex === 0 || levelIndex === thinkingLevels.length - 1) && "opacity-0",
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-between gap-3 text-[0.6875rem] text-muted-foreground">
            <span>Faster</span>
            <span>Smarter</span>
          </div>
        </div>
      )}
    </section>
  );
}

function ModelScrollArea({
  model,
  children,
}: {
  model?: ModelInfo | null;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector("[data-selected-model]")?.scrollIntoView({ block: "nearest" });
  }, [model?.id, model?.provider]);

  return <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">{children}</div>;
}

function ModelList({
  visibleModels,
  query,
  model,
  favoriteModelKeys,
  providerNames,
  onSelect,
}: {
  visibleModels: ModelInfo[];
  query: string;
  model?: ModelInfo | null;
  favoriteModelKeys: Set<string>;
  providerNames: Map<string, string>;
  onSelect: (model: ModelInfo) => void;
}) {
  if (visibleModels.length > 0) {
    return (
      <div className="flex flex-col gap-0.5">
        {visibleModels.map((candidate) => (
          <ModelRow
            key={`${candidate.provider}/${candidate.id}`}
            model={candidate}
            favorite={favoriteModelKeys.has(modelKey(candidate))}
            selected={isSameModel(candidate, model)}
            providerName={providerNames.get(candidate.provider) ?? candidate.provider}
            query={query}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
      {query.trim() ? `No models match “${query.trim()}”.` : "No models are available."}
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
      className={cn("group/model flex min-h-10 items-stretch rounded-md hover:bg-muted/70", selected && "bg-accent")}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(model)}
        onKeyDown={(event) => {
          if (event.key.toLocaleLowerCase() !== "f" || event.ctrlKey || event.altKey || event.metaKey) return;
          event.preventDefault();
          toggleFavoriteModel(model);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ModelProviderIcon provider={model.provider} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{highlightMatch(display, query)}</span>
          <span className="block truncate text-[0.6875rem] text-muted-foreground">
            {highlightMatch(providerName, query)}
          </span>
        </span>
        {context ? (
          <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums text-muted-foreground">{context}</span>
        ) : null}
        {selected ? <CheckIcon className="shrink-0 text-foreground" /> : null}
      </button>
      <button
        type="button"
        aria-label={`${favorite ? "Remove" : "Add"} ${model.name ?? model.id} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
        title={`${favorite ? "Remove from favorites" : "Add to favorites"} (F)`}
        onClick={() => toggleFavoriteModel(model)}
        className={cn(
          "flex w-8 shrink-0 items-center justify-center rounded-r-md text-muted-foreground/35 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset group-hover/model:text-muted-foreground",
          favorite && "text-favorite group-hover/model:text-favorite",
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
