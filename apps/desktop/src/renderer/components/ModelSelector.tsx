import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, StarIcon, WarningCircleIcon } from "../../shared/icons.ts";
import { useState } from "react";
import type { ModelInfo } from "../../shared/pi-types.ts";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";
import { modelKey } from "../../shared/messages.ts";
import { TITLE_GENERATOR_ACTIVE } from "../../shared/title-generator.ts";
import { useAppStore } from "../lib/store.ts";
import { modelProviders } from "../lib/modelProviders.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import BrandIcon from "./BrandIcon.tsx";

type ModelSelectorProps = {
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  showChatModelOption?: boolean;
};

export default function ModelSelector({
  selectedKey,
  onSelectionChange,
  showChatModelOption = false,
}: ModelSelectorProps = {}) {
  const models = useAppStore((s) => s.models);
  const model = useAppStore((s) => s.model);
  const setModel = useAppStore((s) => s.setModel);
  const favoriteModels = useAppStore((s) => s.favoriteModels ?? []);
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const openSettings = useAppStore((s) => s.openSettings);
  const [query, setQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const favoriteModelKeys = new Set(favoriteModels);
  const providerNames = new Map(providers.map((item) => [item.id, item.name]));
  const selection = selectedKey ?? (model ? modelKey(model) : null);
  const selectedModel =
    selection && selection !== TITLE_GENERATOR_ACTIVE
      ? (models.find((item) => modelKey(item) === selection) ?? null)
      : null;
  const displayModel = selection === TITLE_GENERATOR_ACTIVE ? model : selectedModel;
  const label =
    selection === TITLE_GENERATOR_ACTIVE
      ? "Use the chat model"
      : displayModel
        ? (displayModel.name ?? displayModel.id)
        : selection
          ? "Unavailable model"
          : "Model";
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

  function selectModel(next: ModelInfo) {
    if (onSelectionChange) {
      onSelectionChange(modelKey(next));
      return;
    }
    void setModel(next);
  }

  function selectChatModel() {
    onSelectionChange?.(TITLE_GENERATOR_ACTIVE);
  }

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
        {displayModel ? <ModelProviderIcon provider={displayModel.provider} /> : null}
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
              <MenuGroup>
                <ModelList
                  visibleModels={visibleModels}
                  provider={provider}
                  query={query}
                  model={selectedModel}
                  activeModel={model}
                  chatModelSelected={selection === TITLE_GENERATOR_ACTIVE}
                  showChatModelOption={showChatModelOption}
                  onSelectChatModel={selectChatModel}
                  favoriteModelKeys={favoriteModelKeys}
                  favoritesEmpty={favoriteModels.length === 0}
                  providerNames={providerNames}
                  onSelect={selectModel}
                />
              </MenuGroup>
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
  activeModel,
  chatModelSelected,
  showChatModelOption,
  onSelectChatModel,
  favoriteModelKeys,
  favoritesEmpty,
  providerNames,
  onSelect,
}: {
  visibleModels: ModelInfo[];
  provider: string;
  query: string;
  model?: ModelInfo | null;
  activeModel?: ModelInfo | null;
  chatModelSelected: boolean;
  showChatModelOption: boolean;
  onSelectChatModel: () => void;
  favoriteModelKeys: Set<string>;
  favoritesEmpty: boolean;
  providerNames: Map<string, string>;
  onSelect: (model: ModelInfo) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const chatModelText = `${activeModel?.name ?? ""} ${activeModel?.id ?? ""} use the chat model`.toLowerCase();
  const showChatModel = showChatModelOption && (!normalizedQuery || chatModelText.includes(normalizedQuery));
  const chatModelRow = showChatModel ? (
    <ChatModelRow model={activeModel} selected={chatModelSelected} onSelect={onSelectChatModel} />
  ) : null;

  if (visibleModels.length) {
    return (
      <>
        {chatModelRow}
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
  if (chatModelRow) {
    return (
      <>
        {chatModelRow}
        {provider === "favorite" && favoritesEmpty ? (
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

function ChatModelRow({
  model,
  selected,
  onSelect,
}: {
  model?: ModelInfo | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <MenuItem onClick={onSelect} className={cn("group/model min-h-14 rounded-lg px-3", selected && "bg-accent")}>
      <ModelProviderIcon provider={model?.provider ?? ""} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">Use the chat model</p>
        <p className="truncate text-xs text-muted-foreground">
          {model ? (model.name ?? model.id) : "Follows the current chat model"}
        </p>
      </div>
      {selected ? <CheckIcon className="text-success" /> : null}
    </MenuItem>
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

  return (
    <MenuItem
      onClick={() => onSelect(m)}
      // The star is a nested button, which sits outside the menu's
      // roving tabindex and so cannot be tabbed to. F on the
      // highlighted row is the keyboard route to the same action —
      // without it, favorites are mouse-only, and favorites are
      // the entire mechanism for taming a 40-provider list.
      onKeyDown={(event) => {
        if (event.key.toLowerCase() !== "f" || event.ctrlKey || event.altKey || event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        toggleFavoriteModel(m);
      }}
      className={cn("group/model min-h-11 rounded-lg px-3", selected && "bg-accent")}
    >
      <ModelProviderIcon provider={m.provider} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{highlightMatch(friendlyModelName(m), query)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {highlightMatch(showProvider ? providerName : modelMetadata(m), query)}
        </p>
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

function friendlyModelName(model: ModelInfo): string {
  const name = model.name ?? model.id.split("/").at(-1) ?? model.id;
  const context = modelContext(model);
  if (!context) return name;
  return name.replace(new RegExp(`\\s+${context.replace(" ctx", "").replace(".", "\\.")}$`, "i"), "");
}

function modelContext(model: ModelInfo): string {
  const size = model.contextWindow;
  if (!size) return "";
  if (size >= 1_000_000) return `${Number((size / 1_000_000).toFixed(1))}M ctx`;
  if (size >= 1_000) return `${Math.round(size / 1_000)}K ctx`;
  return `${size.toLocaleString()} ctx`;
}

function modelMetadata(model: ModelInfo): string {
  return modelContext(model) || model.id;
}

function highlightMatch(value: string, rawQuery: string) {
  const query = rawQuery.trim();
  const index = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (!query || index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded-sm bg-foreground/15 px-0.5 text-inherit">{value.slice(index, index + query.length)}</mark>
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
