import StateNotice from "../StateNotice.tsx";
import { useEffect, useRef, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { AuthProviderInfo } from "../../../shared/rpc-schema.ts";
import type { AuthFlow } from "../../lib/store.ts";
import { useAppStore } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { providerIconName } from "../../lib/providerIcons.ts";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import BrandIcon from "../BrandIcon.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog.tsx";
import { SettingsEntity, SettingsSection } from "./rows.tsx";

const byProviderName = (a: AuthProviderInfo, b: AuthProviderInfo) => a.name.localeCompare(b.name);

function openExternal(url: string): void {
  void rpc.request.openExternal({ url });
}

function loginMethods(provider: AuthProviderInfo): ("oauth" | "api_key")[] {
  const methods: ("oauth" | "api_key")[] = [];
  if (provider.supportsOAuth) methods.push("oauth");
  if (provider.supportsApiKey) methods.push("api_key");
  return methods;
}

function providerStatusLabel(provider: AuthProviderInfo): string {
  if (provider.ready) {
    if (provider.storedType === "oauth") return "Connected with subscription";
    if (provider.storedType === "api_key") return "Connected with API key";
    if (provider.authSource === "environment") return `Connected through ${provider.authLabel ?? "environment"}`;
    return provider.authLabel ? `Connected through ${provider.authLabel}` : "Connected";
  }
  if (provider.configured) return "Credentials aren't working";
  const methods = loginMethods(provider);
  if (methods.length > 0) return provider.supportsOAuth ? "Subscription sign-in available" : "API key required";
  return "Set up with environment variables";
}

export default function ProviderSettings() {
  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const authFlow = useAppStore((s) => s.authFlow);
  const cancelLogin = useAppStore((s) => s.cancelLogin);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const firstChoiceShown = useRef(false);
  const openPanel = useAppStore(s => s.openAppPanel);
  useEffect(() => { if (adding && selected && providers.some(provider => provider.id === selected && provider.ready)) setAdding(false); }, [adding, selected, providers]);

  const loading = useAppStore(s => s.providersLoading);
  const error = useAppStore(s => s.providersError);
  const reload = useAppStore(s => s.loadProviders);
  useEffect(() => {
    if (firstChoiceShown.current || !providersLoaded || loading || error || !providers.length) return;
    firstChoiceShown.current = true;
    if (!providers.some(p => p.ready || p.configured)) setAdding(true);
  }, [providersLoaded, loading, error, providers]);
  if (error && !loading) return <StateNotice title="Could not load providers" detail={error} retry={() => void reload().catch(() => {})} />;
  if (!providersLoaded || loading) return <StateNotice loading title="Loading providers…" />;

  const normalized = query.trim().toLocaleLowerCase();
  const matching = normalized
    ? providers.filter((provider) => provider.name.toLocaleLowerCase().includes(normalized))
    : providers;
  const connected = providers.filter(provider => provider.ready || provider.configured).toSorted(byProviderName);
  const available = matching.filter(provider => !provider.ready && !provider.configured).toSorted((a,b) => Number(b.supportsOAuth) - Number(a.supportsOAuth) || byProviderName(a,b));
  return <div className="flex flex-col gap-7">
    {!providers.length ? <div role="status"><p className="text-sm text-muted-foreground">No AI services could be found.</p><Button variant="outline" size="sm" className="mt-2" onClick={() => void reload()}>Try loading accounts again</Button></div> : null}
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" onClick={() => { setSelected(null); setAdding(true); setQuery(""); }}>Connect an AI account</Button>
      <Button variant="ghost" size="sm" onClick={() => openPanel("usage")}>View usage</Button>
    </div>
    {connected.length ? <ProviderGroup heading="Connected accounts" providers={connected} selected={selected} setSelected={setSelected} authFlow={authFlow} cancelLogin={cancelLogin} />
      : <p className="text-sm leading-6 text-body-muted-foreground">Connect a model provider to start chatting. NativePi uses Pi’s authentication and models.</p>}
    <Dialog open={adding} onOpenChange={open => { setAdding(open); if (!open && authFlow && !connected.some(provider => provider.id === authFlow.providerId)) cancelLogin(); }}>
      <DialogContent className="max-h-[min(40rem,calc(var(--app-height,100dvh)-2rem))] max-w-xl">
        <DialogHeader><DialogTitle>Connect an AI account</DialogTitle><DialogDescription>Choose your AI service. Supported subscriptions can sign in; API keys may have separate charges.</DialogDescription></DialogHeader>
        <Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search providers" aria-label="Search providers" />
        <div className="@container/settings-content min-h-0 overflow-y-auto">
          {available.length ? <ProviderGroup heading="Available providers" providers={available} selected={selected} setSelected={setSelected} authFlow={authFlow} cancelLogin={cancelLogin} /> : <p role="status" className="text-sm text-muted-foreground">{!providers.length ? "No AI services were found. Close this chooser and try loading accounts again." : query.trim() ? `No providers match “${query.trim()}”.` : "All available providers are connected."}</p>}
        </div>
        <DialogFooter><Button variant="outline" size="sm" onClick={() => { setAdding(false); if (authFlow) cancelLogin(); }}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function ProviderGroup({
  heading,
  providers,
  selected,
  setSelected,
  authFlow,
  cancelLogin,
}: {
  heading: string;
  providers: AuthProviderInfo[];
  selected: string | null;
  setSelected: (id: string | null) => void;
  authFlow: AuthFlow | null;
  cancelLogin: () => void;
}) {
  return <SettingsSection heading={heading}>
    {providers.map(provider => {
      const expanded = selected === provider.id;
      return <SettingsEntity key={provider.id} name={provider.name} description={providerStatusLabel(provider)} icon={<BrandIcon name={providerIconName(provider.id)} size={18} color />} expanded={expanded} onToggle={() => {
        if (authFlow) cancelLogin();
        setSelected(expanded ? null : provider.id);
      }}>
        <ProviderDetails provider={provider} />
      </SettingsEntity>;
    })}
  </SettingsSection>;
}

function ProviderDetails({ provider }: { provider: AuthProviderInfo }) {
  const flow = useAppStore((s) => (s.authFlow?.providerId === provider.id ? s.authFlow : null));
  const startLogin = useAppStore((s) => s.startLogin);
  const logoutProvider = useAppStore((s) => s.logoutProvider);
  const submitAuthPrompt = useAppStore((s) => s.submitAuthPrompt);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const methods = loginMethods(provider);

  if (flow?.prompt) {
    return <div>{flow.error ? <p role="alert" className="px-4 pb-3 text-sm text-destructive">{flow.error}</p> : null}<AuthPromptForm key={flow.prompt.id} provider={provider} onSubmit={submitAuthPrompt} /></div>;
  }

  if (flow && !flow.error && (flow.notices.length > 0 || (flow.busy && flow.type === "oauth"))) {
    return <AuthProgress provider={provider} flow={flow} />;
  }

  if (flow?.busy && !flow.error) {
    return (
      <p className="flex items-center gap-2 px-4 pb-4 pt-1 @min-[36rem]/settings-content:px-14 text-sm text-body-muted-foreground">
        <CircleNotchIcon className="animate-spin" />
        Preparing secure sign-in…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The failure accompanies the orientation copy rather than replacing it:
          "Choose how you'd like to sign in" is exactly what you still need when
          a sign-in has just failed. */}
      <p className="text-sm text-body-muted-foreground">
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
            size="sm"
            className="h-auto max-w-full whitespace-normal break-words py-1.5"
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
              size="sm"
              className="text-muted-foreground hover:text-destructive"
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
  if (!provider.ready)
    return "Pi has credentials for this provider but cannot use them, so its models stay out of the picker. Signing in again replaces them.";
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
    <div className="flex flex-col gap-3">
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
            size="sm" className="mt-1 w-fit"
            onClick={() => openExternal(deviceCode.verificationUri)}
          >
            Open {hostOf(deviceCode.verificationUri)}
          </Button>
        </div>
      ) : null}

      {authUrl ? (
        <div className="flex flex-col gap-2">
          {authUrl.instructions ? <p className="text-sm text-muted-foreground">{authUrl.instructions}</p> : null}
          <Button variant="outline" size="sm" className="w-fit" onClick={() => openExternal(authUrl.url)}>
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

      <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={cancelLogin}>
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
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{prompt.request.message}</p>
        <div className="flex flex-wrap gap-2">
          {prompt.request.options.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="outline"
              size="sm" className="h-auto min-h-8 min-w-0 max-w-full justify-start whitespace-normal py-1.5 text-left"
              onClick={() => onSubmit(option.id)}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5 [overflow-wrap:anywhere]">
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
      className="px-4 pb-4 pt-1 @min-[36rem]/settings-content:px-14"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <Field>
        <FieldLabel htmlFor={`provider-input-${provider.id}`}>{prompt.request.message}</FieldLabel>
        <div className="flex flex-col items-stretch gap-3 @min-[24rem]/settings-content:flex-row @min-[24rem]/settings-content:items-center">
          <Input
            id={`provider-input-${provider.id}`}
            autoFocus
            type={isSecret ? "password" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={"placeholder" in prompt.request ? prompt.request.placeholder : undefined}
            autoComplete="off"
            className="min-w-0 @min-[24rem]/settings-content:flex-1"
          />
          <Button type="submit" size="sm" className="shrink-0 @min-[24rem]/settings-content:min-w-32" disabled={!value.trim()}>
            {isSecret ? (provider.configured ? "Update" : "Connect") : "Continue"}
          </Button>
        </div>
        <FieldDescription>
          {isSecret
            ? "The key is sent directly to Pi and stored in Pi's credential file."
            : "This value is sent directly to Pi to complete sign-in."}
        </FieldDescription>
      </Field>
      <Button variant="ghost" size="sm" className="mt-3" onClick={cancelLogin}>Cancel</Button>
    </form>
  );
}
