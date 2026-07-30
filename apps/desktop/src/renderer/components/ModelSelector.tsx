import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, StarIcon, WarningCircleIcon } from "../../shared/icons.ts";
import { useState } from "react";
import type { ModelInfo } from "../../shared/pi-types.ts";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";
import { modelKey } from "../../shared/messages.ts";
import { useAppStore } from "../lib/store.ts";
import { modelProviders } from "../lib/modelProviders.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import BrandIcon from "./BrandIcon.tsx";

export default function ModelSelector() {
  const models = useAppStore((s) => s.models);
  const model = useAppStore((s) => s.model);
  const favoriteModels = useAppStore((s) => s.favoriteModels ?? []);
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const openSettings = useAppStore((s) => s.openSettings);
  const [query, setQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const favoriteModelKeys = new Set(favoriteModels);
  const providerNames = new Map(providers.map((item) => [item.id, item.name]));
  const label = model ? (model.name ?? model.id) : "Model";
  const availableProviders = modelProviders(providers, models);

  const provider =
    selectedTab ?? (favoriteModels.length > 0 ? "favorite" : (availableProviders[0]?.id ?? "favorite"));

  const visibleModels = models.filter((item) => {
    if (provider === "favorite" && !favoriteModelKeys.has(modelKey(item))) return false;
    if (provider !== "favorite" && item.provider !== provider) return false;
    const providerName = providerNames.get(item.provider) ?? "";
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
      <MenuPopup
        side="top"
        className={cn(
          NO_DRAG_REGION,
          "h-[min(30rem,70vh)] max-h-[calc(var(--available-height)_-_3rem)] w-[min(31rem,calc(100vw-2rem))] overflow-hidden p-0",
        )}
      >
        <div className="flex h-full min-h-0">
          <ProviderRail provider={provider} providers={availableProviders} onSelect={setSelectedTab} />
          <div className="flex min-w-0 flex-1 flex-col p-2">
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Base UI's menu typeahead otherwise consumes printable keys
                  // before the controlled input can update.
                  if (event.key.length === 1) event.stopPropagation();
                }}
                placeholder="Search models…"
                aria-label="Search models"
                className="border-0 bg-muted pl-9 shadow-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {provider === "favorite" ? "Favorite" : (providers.find((item) => item.id === provider)?.name ?? provider)}
              </p>
              <ModelList
                visibleModels={visibleModels}
                provider={provider}
                query={query}
                model={model}
                favoriteModelKeys={favoriteModelKeys}
                favoritesEmpty={favoriteModels.length === 0}
                providerNames={providerNames}
              />
            </div>
          </div>
        </div>
      </MenuPopup>
    </Menu>
  );
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
    <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r py-3">
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
}: {
  visibleModels: ModelInfo[];
  provider: string;
  query: string;
  model?: ModelInfo | null;
  favoriteModelKeys: Set<string>;
  favoritesEmpty: boolean;
  providerNames: Map<string, string>;
}) {
  if (visibleModels.length) {
    return visibleModels.map((m) => (
      <ModelRow
        key={`${m.provider}/${m.id}`}
        model={m}
        favorite={favoriteModelKeys.has(modelKey(m))}
        selected={isSameModel(m, model)}
        providerName={providerNames.get(m.provider) ?? m.provider}
      />
    ));
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
}: {
  model: ModelInfo;
  favorite: boolean;
  selected: boolean;
  providerName: string;
}) {
  const setModel = useAppStore((s) => s.setModel);
  const toggleFavoriteModel = useAppStore((s) => s.toggleFavoriteModel);

  return (
    <MenuItem
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
      className={cn("group/model min-h-14 rounded-lg px-3", selected && "bg-accent")}
    >
      <ModelProviderIcon provider={m.provider} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{m.name ?? m.id}</p>
        <p className="truncate text-xs text-muted-foreground">{providerName}</p>
      </div>
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
        // Hidden until the row is hovered, focused or already
        // starred: a column of grey stars down every row reads as
        // ornament and competes with the model names being scanned.
        className={cn(
          HOVER_REVEAL,
          "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-hover/model:opacity-100 group-data-[highlighted]/model:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
          favorite && "opacity-100",
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
