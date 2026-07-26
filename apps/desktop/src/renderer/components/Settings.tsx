import { useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { StopIcon } from "@phosphor-icons/react/Stop";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";
import type { AuthFlow } from "../lib/store.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { DRAG_REGION, NO_DRAG_REGION, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import ExtensionsManager from "./ExtensionsManager.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import BrandIcon from "./BrandIcon.tsx";

const categories = [
  { name: "General", icon: GearSixIcon },
  { name: "Providers", icon: PlugsConnectedIcon },
  { name: "Extensions", icon: PuzzlePieceIcon },
  { name: "Keybinds", icon: KeyboardIcon },
  { name: "About", icon: InfoIcon },
] as const;

const byProviderName = (a: AuthProviderInfo, b: AuthProviderInfo) => a.name.localeCompare(b.name);

function openExternal(url: string): void {
  void rpc.request.openExternal({ url });
}

type Category = (typeof categories)[number]["name"];

const CATEGORY_BLURBS: Partial<Record<Category, string>> = {
  General: "Control how NativePi starts up and restores your workspace.",
  Providers: "Connect model providers with an API key or subscription sign-in. Credentials are stored by Pi.",
  Extensions: "Install, update, and remove the Pi packages that extend the agent.",
};

export default function Settings() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const reopenLastProject = useAppStore((s) => s.reopenLastProject);
  const setReopenLastProject = useAppStore((s) => s.setReopenLastProject);
  const [category, setCategory] = useState<Category>("General");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ResizablePanelGroup orientation="horizontal" className="bg-background text-foreground">
      {sidebarOpen ? <LeftSidebar
        actionIcon={<ArrowLeftIcon data-icon="inline-start" />}
        actionLabel="Back"
        onAction={closeSettings}
        onClose={() => setSidebarOpen(false)}
      >
        <nav aria-label="Settings categories" className={cn("flex flex-1 flex-col gap-1 px-3 pt-3", NO_DRAG_REGION)}>
          <p className="px-2 pb-2 font-heading text-sm font-semibold">Settings</p>
          {categories.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              aria-current={category === name ? "page" : undefined}
              onClick={() => setCategory(name)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                category === name && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <Icon className="shrink-0" />
              {name}
            </button>
          ))}
        </nav>
      </LeftSidebar> : null}

      <ResizablePanel id="settings" minSize="35%">
        <main className="h-full min-w-0 overflow-y-auto">
        <header className={cn("flex h-12 items-center gap-2 px-10", WINDOW_CONTROLS_CLEARANCE, DRAG_REGION)}>
          {!sidebarOpen ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar"
              aria-label="Open sidebar"
              className={NO_DRAG_REGION}
            >
              <SidebarSimpleIcon />
            </Button>
          ) : null}
          <span className="text-xs font-medium text-muted-foreground">Settings</span>
          <div className="flex-1" />
          <RunningAgentBadge />
        </header>

        {/* One rail: the h1 used to sit in a 56rem container above 48rem content,
            leaving a permanently ragged right edge. */}
        <div className="mx-auto w-full max-w-3xl px-10 pb-16 pt-12">
          <div className="mb-12 flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{category}</h1>
            {CATEGORY_BLURBS[category] ? (
              <p className="text-sm text-muted-foreground">{CATEGORY_BLURBS[category]}</p>
            ) : null}
          </div>

          {category === "General" ? (
            <section aria-labelledby="startup-heading">
              <h2 id="startup-heading" className="mb-5 font-heading text-sm font-semibold">
                Startup
              </h2>
              <div className="flex items-center justify-between gap-8 border-t py-5">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="reopen-project" className="text-sm font-medium">
                    Reopen last project
                  </label>
                  <p className="text-sm leading-5 text-muted-foreground">
                    Return to the project you were working in when NativePi starts.
                  </p>
                </div>
                <Switch
                  id="reopen-project"
                  checked={reopenLastProject}
                  onCheckedChange={setReopenLastProject}
                  aria-label="Reopen last project"
                />
              </div>
            </section>
          ) : category === "Providers" ? (
            <ProviderSettings />
          ) : category === "Extensions" ? (
            <ExtensionsManager />
          ) : null}
        </div>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function RunningAgentBadge() {
  const running = useAppStore((s) => s.running);
  const abort = useAppStore((s) => s.abort);
  const closeSettings = useAppStore((s) => s.closeSettings);
  if (!running) return null;

  return (
    <div className={cn("flex items-center gap-2 text-xs", NO_DRAG_REGION)}>
      <span className="text-muted-foreground">An agent turn is running</span>
      <Button variant="ghost" size="sm" onClick={closeSettings}>
        Back to chat
      </Button>
      <Button variant="destructive" size="sm" onClick={abort}>
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop
      </Button>
    </div>
  );
}

function loginMethods(provider: AuthProviderInfo): ("oauth" | "api_key")[] {
  const methods: ("oauth" | "api_key")[] = [];
  if (provider.supportsOAuth) methods.push("oauth");
  if (provider.supportsApiKey) methods.push("api_key");
  return methods;
}

function providerStatusLabel(provider: AuthProviderInfo): string {
  if (provider.configured) {
    if (provider.storedType === "oauth") return "Connected · Subscription";
    if (provider.storedType === "api_key") return "Connected · API key";
    if (provider.authSource === "environment") return `Connected · ${provider.authLabel ?? "Environment"}`;
    return provider.authLabel ? `Connected · ${provider.authLabel}` : "Connected";
  }
  const methods = loginMethods(provider);
  if (methods.length > 0) return "Not connected";
  return "Set up with environment variables";
}

function ProviderSettings() {
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const authFlow = useAppStore((s) => s.authFlow);
  const cancelLogin = useAppStore((s) => s.cancelLogin);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  if (!providersLoaded) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleNotchIcon className="animate-spin" />
        Loading providers…
      </p>
    );
  }

  const normalized = query.trim().toLocaleLowerCase();
  const matching = normalized
    ? providers.filter((provider) => provider.name.toLocaleLowerCase().includes(normalized))
    : providers;
  const connected = matching.filter((provider) => provider.configured).toSorted(byProviderName);
  const available = matching.filter((provider) => !provider.configured).toSorted(byProviderName);

  return (
    <div className="flex flex-col gap-8">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search providers"
          aria-label="Search providers"
          className="pl-9"
        />
      </div>

      {connected.length === 0 && available.length === 0 ? (
        <p className="text-sm text-muted-foreground">No providers match “{query.trim()}”.</p>
      ) : null}

      {connected.length > 0 ? (
        <ProviderGroup
          heading="Connected"
          description="These providers are ready to use in the model picker."
          providers={connected}
          selected={selected}
          setSelected={setSelected}
          authFlow={authFlow}
          cancelLogin={cancelLogin}
        />
      ) : null}

      {available.length > 0 ? (
        <ProviderGroup
          heading="Available"
          description="Connect one of these to add its models."
          providers={available}
          selected={selected}
          setSelected={setSelected}
          authFlow={authFlow}
          cancelLogin={cancelLogin}
        />
      ) : null}
    </div>
  );
}

function ProviderGroup({
  heading,
  description,
  providers,
  selected,
  setSelected,
  authFlow,
  cancelLogin,
}: {
  heading: string;
  description: string;
  providers: AuthProviderInfo[];
  selected: string | null;
  setSelected: (id: string | null) => void;
  authFlow: AuthFlow | null;
  cancelLogin: () => void;
}) {
  const headingId = `providers-${heading.toLocaleLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="mb-3 flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-sm font-semibold">
          {heading}
          <span className="ml-2 font-sans text-xs font-normal text-muted-foreground tabular-nums">
            {providers.length}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {providers.map((provider) => {
        const expanded = selected === provider.id;
        const activeFlow = authFlow?.providerId === provider.id ? authFlow : null;

        return (
          <div key={provider.id} className="border-t first:border-t-0">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                if (expanded) {
                  if (activeFlow) cancelLogin();
                  setSelected(null);
                  return;
                }
                if (authFlow) cancelLogin();
                setSelected(provider.id);
              }}
              className="flex w-full items-center gap-4 rounded-lg px-2 py-5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <BrandIcon
                  name={providerIconName(provider.id)}
                  size={21}
                  color
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{provider.name}</span>
                <span
                  className={cn(
                    "mt-1 block truncate text-sm",
                    provider.configured ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {providerStatusLabel(provider)}
                </span>
              </span>
              {activeFlow?.busy ? (
                <CircleNotchIcon className="shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <CaretDownIcon
                  className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                />
              )}
            </button>

            {expanded ? <ProviderDetails provider={provider} /> : null}
          </div>
        );
      })}
    </section>
  );
}

function ProviderDetails({ provider }: { provider: AuthProviderInfo }) {
  const flow = useAppStore((s) => (s.authFlow?.providerId === provider.id ? s.authFlow : null));
  const startLogin = useAppStore((s) => s.startLogin);
  const logoutProvider = useAppStore((s) => s.logoutProvider);
  const submitAuthPrompt = useAppStore((s) => s.submitAuthPrompt);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const methods = loginMethods(provider);

  if (flow?.prompt) {
    return <AuthPromptForm key={flow.prompt.id} provider={provider} onSubmit={submitAuthPrompt} />;
  }

  if (flow && !flow.error && (flow.notices.length > 0 || (flow.busy && flow.type === "oauth"))) {
    return <AuthProgress provider={provider} flow={flow} />;
  }

  if (flow?.busy && !flow.error) {
    return (
      <p className="flex items-center gap-2 px-14 pb-6 pt-1 text-sm text-muted-foreground">
        <CircleNotchIcon className="animate-spin" />
        Preparing secure sign-in…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-14 pb-6 pt-1">
      {/* The failure accompanies the orientation copy rather than replacing it:
          "Choose how you'd like to sign in" is exactly what you still need when
          a sign-in has just failed. */}
      <p className="text-sm text-muted-foreground">
        {provider.configured
          ? describeConnected(provider)
          : methods.length > 0
            ? "Choose how you'd like to sign in to this provider."
            : "This provider has no in-app login. Pi reads its credentials from environment variables, cloud profiles, or a config file."}
      </p>
      {flow?.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <WarningCircleIcon weight="fill" className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{flow.error}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {methods.map((method) => (
          <Button
            key={method}
            variant={method === "oauth" ? "default" : "outline"}
            size="xl"
            className="min-w-40"
            disabled={flow?.busy}
            onClick={() => void startLogin(provider.id, method)}
          >
            {loginActionLabel(provider, method)}
          </Button>
        ))}
        {provider.configured && provider.storedType ? (
          <>
            <Button
              variant="ghost"
              size="xl"
              className="min-w-32 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmingDisconnect(true)}
            >
              Disconnect
            </Button>
            <ConfirmDialog
              open={confirmingDisconnect}
              title={`Disconnect ${provider.name}?`}
              description={
                <>
                  Pi will delete the stored credential and restart, and this provider's models will disappear from the
                  picker. You can reconnect at any time by signing in again.
                </>
              }
              confirmLabel="Disconnect"
              destructive
              onConfirm={() => {
                setConfirmingDisconnect(false);
                void logoutProvider(provider.id);
              }}
              onCancel={() => setConfirmingDisconnect(false)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function describeConnected(provider: AuthProviderInfo): string {
  if (provider.storedType === "oauth") return "Signed in with a subscription account through Pi.";
  if (provider.storedType === "api_key") return "Connected with an API key stored by Pi.";
  if (provider.authSource === "environment")
    return `Configured from your environment${provider.authLabel ? ` (${provider.authLabel})` : ""}. You can also sign in below.`;
  return "This provider is connected through Pi.";
}

function loginActionLabel(provider: AuthProviderInfo, method: "oauth" | "api_key"): string {
  if (method === "oauth") {
    if (provider.configured && provider.storedType === "oauth") return "Reconnect";
    return provider.oauthLabel ?? "Sign in";
  }
  if (provider.configured && provider.storedType === "api_key") return "Change API key";
  return provider.configured ? "Add API key" : (provider.apiKeyLabel ?? "Use API key");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "sign-in page";
  }
}

function AuthProgress({ provider, flow }: { provider: AuthProviderInfo; flow: AuthFlow }) {
  const cancelLogin = useAppStore((s) => s.cancelLogin);
  const deviceCode = flow.notices.findLast((n) => n.kind === "device_code");
  const authUrl = flow.notices.findLast((n) => n.kind === "auth_url");
  const messages = flow.notices.filter((n) => n.kind === "progress" || n.kind === "info");

  return (
    <div className="flex flex-col gap-4 px-14 pb-6 pt-1">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleNotchIcon className="animate-spin" />
        Waiting for you to finish signing in to {provider.name} in your browser…
      </p>

      {deviceCode ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">Enter this code in your browser:</p>
          <p className="select-all font-mono text-2xl font-semibold tracking-[0.2em]">{deviceCode.userCode}</p>
          <Button
            variant="outline"
            size="xl" className="mt-1 w-fit"
            onClick={() => openExternal(deviceCode.verificationUri)}
          >
            Open {hostOf(deviceCode.verificationUri)}
          </Button>
        </div>
      ) : null}

      {authUrl ? (
        <div className="flex flex-col gap-2">
          {authUrl.instructions ? <p className="text-sm text-muted-foreground">{authUrl.instructions}</p> : null}
          <Button variant="outline" size="xl" className="w-fit" onClick={() => openExternal(authUrl.url)}>
            Open sign-in page
          </Button>
        </div>
      ) : null}

      {messages.map((notice, i) => (
        <p key={i} className="text-sm text-muted-foreground">
          {notice.message}
          {notice.kind === "info"
            ? notice.links?.map((l) => (
                <button
                  key={l.url}
                  type="button"
                  onClick={() => openExternal(l.url)}
                  className="ml-2 underline underline-offset-2 hover:text-foreground"
                >
                  {l.label ?? l.url}
                </button>
              ))
            : null}
        </p>
      ))}

      <Button variant="ghost" size="xl" className="w-fit text-muted-foreground" onClick={cancelLogin}>
        Cancel
      </Button>
    </div>
  );
}

function AuthPromptForm({
  provider,
  onSubmit,
}: {
  provider: AuthProviderInfo;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const flow = useAppStore((s) => (s.authFlow?.providerId === provider.id ? s.authFlow : null));
  const cancelLogin = useAppStore((s) => s.cancelLogin);
  const prompt = flow?.prompt;

  if (!prompt) return null;

  if (prompt.request.kind === "select") {
    return (
      <div className="flex flex-col gap-3 px-14 pb-6 pt-1">
        <p className="text-sm font-medium">{prompt.request.message}</p>
        <div className="flex flex-wrap gap-2">
          {prompt.request.options.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="outline"
              size="xl" className="h-auto min-h-10 min-w-40 justify-start py-2 text-left"
              onClick={() => onSubmit(option.id)}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span>{option.label}</span>
                {option.description ? (
                  <span className="text-xs font-normal text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </Button>
          ))}
        </div>
        <button
          type="button"
          onClick={cancelLogin}
          className="w-fit text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  const isSecret = prompt.request.kind === "secret";

  return (
    <form
      className="px-14 pb-6 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <Field>
        <FieldLabel htmlFor={`provider-input-${provider.id}`}>{prompt.request.message}</FieldLabel>
        <div className="flex items-center gap-3">
          <Input
            id={`provider-input-${provider.id}`}
            autoFocus
            type={isSecret ? "password" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={"placeholder" in prompt.request ? prompt.request.placeholder : undefined}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="xl" className="min-w-32" disabled={!value.trim()}>
            {isSecret ? (provider.configured ? "Update" : "Connect") : "Continue"}
          </Button>
        </div>
        <FieldDescription>
          {isSecret
            ? "The key is sent directly to Pi and stored in Pi's credential file."
            : "This value is sent directly to Pi to complete sign-in."}
        </FieldDescription>
      </Field>
    </form>
  );
}
