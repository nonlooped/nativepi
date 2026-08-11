import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import {
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import DOMPurify from "dompurify";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "@/lib/rpc.ts";
import { useAppStore } from "@/lib/store.ts";
import { THEME_CHANGE_EVENT } from "@/lib/themes.ts";

const streamingContext = createContext(false);
const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [
  [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ["mermaid"] }],
  [rehypeKatex, { strict: false, throwOnError: false }],
];
let mermaidImport: Promise<typeof import("mermaid")> | undefined;
let mermaidRender = 1;
let themeVersion = 0;
const themeListeners = new Set<() => void>();
let stopThemeListener: (() => void) | undefined;

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  if (!stopThemeListener) {
    const update = () => {
      themeVersion += 1;
      for (const notify of themeListeners) notify();
    };
    window.addEventListener(THEME_CHANGE_EVENT, update);
    stopThemeListener = () => window.removeEventListener(THEME_CHANGE_EVENT, update);
  }
  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0) {
      stopThemeListener?.();
      stopThemeListener = undefined;
    }
  };
}

function loadMermaid(): Promise<typeof import("mermaid")> {
  mermaidImport ??= import("mermaid").catch((error) => {
    mermaidImport = undefined;
    throw error;
  });
  return mermaidImport;
}

function sourceHash(source: string): string {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function languageOf(node: ReactNode): string | undefined {
  if (!isValidElement<{ className?: string }>(node)) return undefined;
  return /(?:^|\s)language-([^\s]+)/.exec(node.props.className ?? "")?.[1];
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {}
  }

  return (
    <Button
      aria-label={copied ? "Code copied" : "Copy code"}
      title={copied ? "Copied" : "Copy code"}
      variant="ghost"
      size="icon-xs"
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const currentThemeVersion = useSyncExternalStore(subscribeTheme, () => themeVersion);
  const [result, setResult] = useState<{ source: string; svg?: string; error?: string }>({ source });

  useEffect(() => {
    let active = true;
    setResult({ source });
    void (async () => {
      try {
        const { default: mermaid } = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
          fontFamily: "inherit",
        });
        const renderId = `nativepi-mermaid-${id}-${currentThemeVersion}-${sourceHash(source)}-${mermaidRender++}`;
        const { svg } = await mermaid.render(renderId, source);
        const safeSvg = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ["script", "foreignObject"],
        });
        if (active) setResult({ source, svg: safeSvg });
      } catch {
        if (active) setResult({ source, error: "Diagram could not be rendered." });
      }
    })();
    return () => {
      active = false;
    };
  }, [currentThemeVersion, id, source]);

  if (result.source !== source || (!result.svg && !result.error)) {
    return <div className="markdown-diagram-status">Rendering diagram…</div>;
  }
  if (result.error) {
    return (
      <div className="markdown-diagram-error">
        <span>{result.error}</span>
        <pre><code>{source}</code></pre>
      </div>
    );
  }
  return <div className="markdown-diagram" dangerouslySetInnerHTML={{ __html: result.svg ?? "" }} />;
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  const streaming = useContext(streamingContext);
  const code = textOf(children).replace(/\n$/, "");
  const language = languageOf(children);

  if (language === "mermaid" && !streaming) return <MermaidDiagram source={code} />;

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span>{language === "mermaid" ? "Mermaid" : (language ?? "Code")}</span>
        <CopyCodeButton code={code} />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components: Components = {
  a({ node: _node, href, children, ...props }) {
    return (
      <a
        {...props}
        href={href}
        rel="noreferrer"
        onClick={(event) => {
          if (!href || href.startsWith("#")) return;
          try {
            const url = new URL(href ?? "");
            if (url.protocol === "https:" || url.protocol === "http:") {
              event.preventDefault();
              void rpc.request.openExternal({ url: url.href });
            }
          } catch {
            const state = useAppStore.getState();
            if (!state.activeProjectPath) return;
            let file = href.split(/[?#]/, 1)[0] ?? href;
            try {
              file = decodeURIComponent(file);
            } catch {}
            event.preventDefault();
            void rpc.request.openFileIn({
              projectDir: state.activeProjectPath,
              file,
              editorId: state.preferences.preferredEditorId,
            });
          }
        }}
      >
        {children}
      </a>
    );
  },
  pre: MarkdownPre,
  table({ node: _node, ...props }) {
    return <div className="markdown-table"><table {...props} /></div>;
  },
};

export default function Markdown({
  children,
  className,
  streaming = false,
}: {
  children: string;
  className?: string;
  streaming?: boolean;
}) {
  return (
    <streamingContext.Provider value={streaming}>
      <div className={cn("markdown", className)} data-streaming={streaming || undefined}>
        <ReactMarkdown
          components={components}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          skipHtml
        >
          {children}
        </ReactMarkdown>
        {streaming ? <span className="markdown-caret" aria-hidden="true" /> : null}
      </div>
    </streamingContext.Provider>
  );
}
