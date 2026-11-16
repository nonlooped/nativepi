import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { z } from "zod";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { BrowserIcon } from "@phosphor-icons/react/Browser";
import { GlobeIcon } from "@phosphor-icons/react/Globe";
import { HandIcon } from "@phosphor-icons/react/Hand";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { XIcon } from "@phosphor-icons/react/X";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { cn, NO_DRAG_REGION } from "../lib/utils.ts";
import { themeCssProperties } from "../../shared/themeCss.ts";
import {
  browserUrl,
  browserChromeStateSchema,
  browserChromeThemeSchema,
  type browserChromeActionSchema,
} from "../../shared/browser.ts";
import "../index.css";

type State = z.infer<typeof browserChromeStateSchema>;
type Action = z.infer<typeof browserChromeActionSchema>;
type Bridge = {
  platform: string;
  invoke(action: Action): Promise<{ error?: string } | undefined>;
  onState(listener: (state: unknown) => void): () => void;
  onTheme(listener: (theme: unknown) => void): () => void;
};
const bridge = (window as typeof window & { nativepiBrowser: Bridge })
  .nativepiBrowser;
const useBrowser = create<State & { update(state: State): void }>((set) => ({
  tabs: [],
  url: "",
  handoff: false,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  update: set,
}));

function IconAction({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
function BrowserChrome() {
  const state = useBrowser();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [about, setAbout] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const header = useRef<HTMLElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const active = state.tabs.find((t) => t.id === state.active);
  const send = async (
    action: Action["action"],
    extra: Partial<Action> = {},
  ) => {
    setError("");
    setDetails(false);
    try {
      const result = await bridge.invoke({
        action,
        tab: state.active,
        ...extra,
      });
      if (result?.error && !useBrowser.getState().error) setError(result.error);
    } catch {
      setError("That action couldn’t be completed. Try again.");
    }
  };
  useEffect(() => {
    const stopState = bridge.onState((raw) => {
      const parsed = browserChromeStateSchema.safeParse(raw);
      if (parsed.success) useBrowser.getState().update(parsed.data);
    });
    const stopTheme = bridge.onTheme((raw) => {
      const parsed = browserChromeThemeSchema.safeParse(raw);
      if (!parsed.success) return;
      const theme = parsed.data;
      const root = document.documentElement;
      root.classList.toggle("dark", theme.appearance === "dark");
      root.style.colorScheme = theme.appearance;
      root.style.fontSize = `${16 * theme.scale}px`;
      root.dataset.motion =
        theme.motion === "always"
          ? "reduced"
          : theme.motion === "never"
            ? "full"
            : "";
      for (const [property, value] of Object.entries(
        themeCssProperties(theme.colors),
      ))
        root.style.setProperty(property, value);
    });
    void bridge.invoke({ action: "state" });
    return () => {
      stopState();
      stopTheme();
    };
  }, []);
  useEffect(() => {
    if (!editing) setAddress(state.url);
  }, [state.url, editing]);
  useEffect(() => {
    const node = tabs.current;
    if (!node) return;
    const reveal = () =>
      node
        .querySelector('[aria-current="page"]')
        ?.parentElement?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(node);
    return () => observer.disconnect();
  }, [state.active, active?.title]);
  useEffect(() => {
    const node = header.current;
    if (!node) return;
    const update = () =>
      void bridge.invoke({
        action: "layout",
        height: Math.ceil(node.getBoundingClientRect().height),
      });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, []);
  const navigate = () => {
    let url = address.trim();
    if (url.includes("://") && !/^https?:\/\//i.test(url)) {
      setError("Enter an HTTP or HTTPS address.");
      return;
    }
    if (!/^https?:\/\//i.test(url))
      url = `${/^(localhost\b|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}\b)|^[^/]+:\d+(?:\/|$)/i.test(url) ? "http" : "https"}://${url}`;
    if (!browserUrl.safeParse(url).success) {
      setError("Enter a valid HTTP or HTTPS address.");
      return;
    }
    void send(state.active ? "navigate" : "open", { url });
    input.current?.blur();
  };
  const focusAddress = () => {
    input.current?.focus();
    input.current?.select();
  };
  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-foreground">
      <header ref={header} className="shrink-0 bg-sidebar">

        <div
          className={cn(
            "flex h-12 min-w-0 items-center gap-1 px-3",
          )}
        >
          <nav
            ref={tabs}
            style={{ scrollbarWidth: "none" }}
            aria-label="Browser tabs"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto",
              NO_DRAG_REGION,
            )}
          >
            {!state.tabs.length && (
              <span className="px-2 text-sm font-medium">Browser</span>
            )}
            {state.tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "flex h-7 min-w-0 max-w-48 shrink-0 items-center rounded-md",
                  tab.id === state.active && "bg-secondary",
                )}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  aria-current={tab.id === state.active ? "page" : undefined}
                  onClick={() => void send("show", { tab: tab.id })}
                  title={tab.title}
                  className={cn(
                    "min-w-0 max-w-40",
                    tab.id === state.active && "text-foreground",
                  )}
                >
                  <GlobeIcon />
                  <span className="truncate">{tab.title}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={`Close ${tab.title}`}
                  aria-label={`Close ${tab.title}`}
                  onClick={() => void send("close", { tab: tab.id })}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </nav>
          <div
            className={cn("flex shrink-0 items-center gap-1", NO_DRAG_REGION)}
          >
            <IconAction
              label="New tab"
              disabled={state.tabs.length >= 8}
              onClick={() => {
                void send("new");
                setAddress("");
                focusAddress();
              }}
            >
              <PlusIcon />
            </IconAction>
            {active && (
              <Button
                variant={state.handoff ? "secondary" : "ghost"}
                size="sm"
                title={
                  state.handoff
                    ? "Return browser control to the agent"
                    : "Pause agent control for sign-in or consent"
                }
                aria-label={
                  state.handoff ? "Resume agent control" : "Take control"
                }
                onClick={() => void send(state.handoff ? "resume" : "handoff")}
              >
                <HandIcon />
                {state.handoff ? (
                  <span>
                    Resume
                    <span className="hidden min-[640px]:inline"> agent</span>
                  </span>
                ) : (
                  <span className="hidden min-[640px]:inline">
                    Take control
                  </span>
                )}
              </Button>
            )}
            <IconAction label="About this chat’s browser" onClick={() => setAbout(value => !value)}><InfoIcon /></IconAction>
            <IconAction label="Hide browser" onClick={() => void send("windowClose")}><XIcon /></IconAction>
          </div>
        </div>
        {about ? <p className="border-b px-4 py-2 text-xs leading-5 text-body-muted-foreground">Shared with Pi in {state.ownerTitle || "this Work chat"}. Tabs and sign-ins clear when this window or Pi closes, or Pi restarts. Downloads, popups and device permissions require your usual browser.</p> : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
          className="flex h-11 items-center gap-1 border-b px-3"
        >
          <IconAction
            label="Back"
            disabled={!state.canGoBack}
            onClick={() => void send("back")}
          >
            <ArrowLeftIcon />
          </IconAction>
          <IconAction
            label="Forward"
            disabled={!state.canGoForward}
            onClick={() => void send("forward")}
          >
            <ArrowRightIcon />
          </IconAction>
          <IconAction
            label="Reload page"
            disabled={!active}
            onClick={() => void send("reload")}
          >
            {state.loading ? (
              <SpinnerGapIcon className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ArrowClockwiseIcon />
            )}
          </IconAction>
          <Input
            ref={input}
            aria-label="Address"
            placeholder="Enter a website or local app address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onFocus={() => {
              setEditing(true);
              input.current?.select();
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setAddress(state.url);
                input.current?.blur();
              }
            }}
            className="ml-1 flex-1"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            title="Navigate"
            aria-label="Navigate"
            disabled={!address.trim()}
          >
            <ArrowRightIcon />
          </Button>
        </form>
        {state.notice ? <div role="status" className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs leading-5 text-body-muted-foreground"><WarningCircleIcon className="size-4 shrink-0" /><span className="min-w-0 flex-1">{state.notice.message}</span>{state.notice.url ? <Button type="button" size="xs" variant="outline" title="Opens outside this chat; you may need to sign in there" onClick={() => void send("openExternal", { url: state.notice?.url })}>Open in usual browser</Button> : null}<IconAction label="Dismiss notice" onClick={() => void send("dismissNotice")}><XIcon /></IconAction></div> : null}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b px-4 py-2 text-xs text-destructive"
          >
            <WarningCircleIcon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <IconAction label="Dismiss error" onClick={() => setError("")}>
              <XIcon />
            </IconAction>
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center p-8">
        {(!active || state.loading || state.error) && (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            {state.error ? (
              <WarningCircleIcon className="size-6 text-muted-foreground" />
            ) : state.loading ? (
              <SpinnerGapIcon className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
            ) : (
              <BrowserIcon className="size-6 text-muted-foreground" />
            )}
            <div className="flex flex-col gap-1">
              <h1 className="text-sm font-medium">
                {state.error
                  ? "Couldn’t load this page"
                  : state.loading
                    ? "Loading page…"
                    : "Open a page"}
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {state.error
                  ? "Check the address or your connection."
                  : state.loading
                    ? ""
                    : "Enter a website or local server address above."}
              </p>
              {!active && !state.error ? <p className="mt-2 text-xs leading-5 text-muted-foreground">This browser is shared with Pi in {state.ownerTitle || "this Work chat"}. Tabs and sign-ins clear when this window or Pi closes, or Pi restarts.</p> : null}
            </div>
            {state.error && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void send("reload")}
                >
                  <ArrowClockwiseIcon />
                  Try again
                </Button>
                <Button
                  variant="link"
                  size="xs"
                  onClick={() => setDetails(!details)}
                >
                  {details ? "Hide details" : "Show details"}
                </Button>
                {details && (
                  <p className="max-w-full break-words text-xs text-muted-foreground">
                    {state.error}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<BrowserChrome />);
