import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import {
  createContext,
  isValidElement,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import DOMPurify from "dompurify";
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Button } from "@/components/ui/button.tsx";
import { ContextualIcon } from "@/components/ui/contextual-icon.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "@/lib/rpc.ts";
import { useAppStore } from "@/lib/store.ts";
import { referenceFor, remarkReferences } from "../lib/markdownReferences.ts";
import { ReferenceChip, QuotedContext, useReferenceSkills, openReference } from "./TranscriptReferences.tsx";
import TranscriptMedia, { mediaKind } from "./TranscriptMedia.tsx";
import { THEME_CHANGE_EVENT } from "@/lib/themes.ts";

const streamingContext = createContext(false);
const markdownSourceContext = createContext("");
const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [
  [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ["mermaid"] }],
  [rehypeKatex, { strict: false, throwOnError: false }],
];
let mermaidImport: Promise<typeof import("mermaid")> | undefined;
let mermaidRender = 1;
function nextMermaidRender() { return mermaidRender++; }
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
      <ContextualIcon active={copied} activeIcon={<CheckIcon />} inactiveIcon={<CopyIcon />} />
    </Button>
  );
}

async function renderMermaid(source: string, id: string, currentThemeVersion: number) {
  const { default: mermaid } = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    secure: [...(mermaid.mermaidAPI.defaultConfig.secure ?? []), "htmlLabels"],
    suppressErrorRendering: true,
    theme: "neutral",
    themeVariables: (() => {
      const styles = getComputedStyle(document.documentElement);
      const color = (role: string) => styles.getPropertyValue(role).trim();
      return {
        darkMode: document.documentElement.classList.contains("dark"),
        background: color("--background"),
        primaryColor: color("--card"),
        primaryTextColor: color("--foreground"),
        primaryBorderColor: color("--border"),
        secondaryColor: color("--muted"),
        secondaryTextColor: color("--foreground"),
        secondaryBorderColor: color("--border"),
        tertiaryColor: color("--accent"),
        tertiaryTextColor: color("--foreground"),
        tertiaryBorderColor: color("--border"),
        lineColor: color("--muted-foreground"),
        textColor: color("--foreground"),
        mainBkg: color("--card"),
        nodeBorder: color("--border"),
      };
    })(),
    fontFamily: "inherit",
  });
  const renderId = `nativepi-mermaid-${id}-${currentThemeVersion}-${sourceHash(source)}-${nextMermaidRender()}`;
  const { svg } = await mermaid.render(renderId, source);
  const safeSvg = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
  });
  return safeSvg;
}

function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const currentThemeVersion = useSyncExternalStore(subscribeTheme, () => themeVersion);
  const [result, setResult] = useState<{ source: string; svg?: string; error?: string }>({ source });

  useEffect(() => {
    let active = true;
    setResult({ source });
    void renderMermaid(source, id, currentThemeVersion).then(
      svg => { if (active) setResult({ source, svg }); },
      () => { if (active) setResult({ source, error: "Diagram could not be rendered." }); },
    );
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

export function handleMarkdownLink(event: Pick<MouseEvent<HTMLAnchorElement>, "preventDefault">, href?: string) {
  if (href?.startsWith("#")) return;
  event.preventDefault();
  if (!href) return;
  const reference = referenceFor(href);
  if (reference) { void openReference(reference); return; }
  if (/^mailto:/i.test(href)) { void rpc.request.openExternal({ url: href }); return; }
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return;
  const state = useAppStore.getState();
  if (state.activeProjectPath) void rpc.request.openFileIn({ projectDir: state.activeProjectPath, file: href, editorId: state.preferences.preferredEditorId });
}

export function markdownUrlTransform(url: string, key: string): string {
  if (key === "href" && referenceFor(url)) return url;
  if (key === "src") {
    if (/^(?:[a-z]:[\\/]|file:)/i.test(url)) return url;
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:/i.test(url)) return "";
  }
  return defaultUrlTransform(url);
}

function MarkdownReference({ href, children, source }: { href: string; children: ReactNode; source: string }) {
  const skills = useReferenceSkills();
  const reference = referenceFor(href, skills);
  const path = reference?.kind === "file" ? reference.path : href;
  const kind = reference?.kind === "file" ? mediaKind(path) : null;
  return kind ? <TranscriptMedia path={path} label={textOf(children) === href && reference?.kind === "file" ? reference.label : textOf(children)} source={source} />
    : <ReferenceChip value={href} label={textOf(children)} source={source} />;
}

function MarkdownAnchorFallback({ href, children, source, props }: { href?: string; children: ReactNode; source: string; props: object }) {
  const skills = useReferenceSkills();
  return href && referenceFor(href, skills) ? <MarkdownReference href={href} source={source}>{children}</MarkdownReference>
    : <a {...props} href={href} rel="noreferrer" onClick={event => handleMarkdownLink(event, href)}>{children}</a>;
}

/** Replace selected chip labels with the exact authored reference on copy. */
export function copyMarkdownReferences(event: React.ClipboardEvent<HTMLElement>) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const fragment = selection.getRangeAt(0).cloneContents();
  const references = fragment.querySelectorAll<HTMLElement>("[data-reference-source]");
  if (!references.length) return;
  for (const reference of references) reference.replaceWith(reference.dataset.referenceSource ?? reference.textContent ?? "");
  // innerText preserves paragraph and list breaks after resolving the chips.
  const container = document.createElement("div");
  container.append(fragment);
  for (const block of container.querySelectorAll("p,div,li,pre,blockquote")) block.append("\n");
  for (const br of container.querySelectorAll("br")) br.replaceWith("\n");
  event.preventDefault();
  event.clipboardData.setData("text/plain", container.textContent ?? "");
}

const components: Components = {
  img({ src, alt }) {
    return <TranscriptMedia path={typeof src === "string" ? src : undefined} label={alt || "Media"} source={`![${alt ?? ""}](${src ?? ""})`} />;
  },
  a: function MarkdownAnchor({ node, href, children, ...props }) {
    const source = useContext(markdownSourceContext);
    const start = node?.position?.start.offset;
    const end = node?.position?.end.offset;
    const original = String(node?.properties?.["data-reference-source"] ??
      (start !== undefined && end !== undefined ? source.slice(start, end) : href ?? ""));
    if (href && referenceFor(href)) return <MarkdownReference href={href} source={original}>{children}</MarkdownReference>;
    // Known slash skills are resolved against Pi's own skill list.
    return <MarkdownAnchorFallback href={href} source={original} props={props}>{children}</MarkdownAnchorFallback>;
  },
  blockquote: function MarkdownQuote({ node, children }) {
    const source = useContext(markdownSourceContext);
    const start = node?.position?.start.offset;
    const end = node?.position?.end.offset;
    const original = start !== undefined && end !== undefined ? source.slice(start, end) : undefined;
    const text = textOf(children).trim();
    return <div data-reference-source={original}><QuotedContext terminal={text.startsWith("Terminal:")} reply={text.startsWith("Reply to response")} preview={text}>{children}</QuotedContext></div>;
  },
  pre: MarkdownPre,
  table({ node: _node, ...props }) {
    return <div className="markdown-table"><table {...props} /></div>;
  },
};

export default function Markdown({
  children,
  className,
  streaming: isStreaming,
}: {
  children: string;
  className?: string;
  streaming?: boolean;
}) {
  // Parsing Markdown, highlighting code, and laying out KaTeX can exceed a
  // token's arrival interval. Let input and controls paint first while a live
  // response catches up; committed messages keep rendering synchronously.
  const streaming = isStreaming ?? false;
  const skills = useReferenceSkills();
  const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkMath, [remarkReferences, { skills }]];
  const deferredChildren = useDeferredValue(children);
  const renderedChildren = streaming ? deferredChildren : children;

  return (
    <streamingContext.Provider value={streaming}>
      <markdownSourceContext.Provider value={renderedChildren}>
      <div className={cn("markdown", className)} data-streaming={streaming || undefined} onCopy={copyMarkdownReferences}>
        <ReactMarkdown
          components={components}
          urlTransform={markdownUrlTransform}
          remarkPlugins={remarkPlugins}
          // Highlighting and KaTeX walk and transform the whole syntax tree.
          // Repeating that work as a response grows makes long code or formula
          // streams progressively slower; the finalized render applies both
          // once, while the live preview keeps ordinary Markdown structure.
          rehypePlugins={streaming ? undefined : rehypePlugins}
          skipHtml
        >
          {renderedChildren}
        </ReactMarkdown>
        {streaming ? <span className="markdown-caret" aria-hidden="true" /> : null}
      </div>
      </markdownSourceContext.Provider>
    </streamingContext.Provider>
  );
}
