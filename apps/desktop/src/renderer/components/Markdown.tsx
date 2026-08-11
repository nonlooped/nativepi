import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import {
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "@/lib/rpc.ts";
import { THEME_CHANGE_EVENT } from "@/lib/themes.ts";

const streamingContext = createContext(false);
const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [
  [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ["mermaid"] }],
  [rehypeKatex, { strict: false, throwOnError: false }],
];
const streamingRehypePlugins: NonNullable<Options["rehypePlugins"]> = [];

let mermaidImport: Promise<typeof import("mermaid")> | undefined;

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
  const [themeVersion, setThemeVersion] = useState(0);
  const [result, setResult] = useState<{ source: string; svg?: string; error?: string }>({ source });

  useEffect(() => {
    const update = () => setThemeVersion((version) => version + 1);
    window.addEventListener(THEME_CHANGE_EVENT, update);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, update);
  }, []);

  useEffect(() => {
    let active = true;
    setResult({ source });
    void (async () => {
      try {
        mermaidImport ??= import("mermaid");
        const { default: mermaid } = await mermaidImport;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(`nativepi-mermaid-${id}`, source);
        if (active) setResult({ source, svg });
      } catch {
        if (active) setResult({ source, error: "Diagram could not be rendered." });
      }
    })();
    return () => {
      active = false;
    };
  }, [id, source, themeVersion]);

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
          event.preventDefault();
          try {
            const url = new URL(href ?? "");
            if (url.protocol === "https:" || url.protocol === "http:") {
              void rpc.request.openExternal({ url: url.href });
            }
          } catch {}
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
          rehypePlugins={streaming ? streamingRehypePlugins : rehypePlugins}
          skipHtml
        >
          {children}
        </ReactMarkdown>
        {streaming ? <span className="markdown-caret" aria-hidden="true" /> : null}
      </div>
    </streamingContext.Provider>
  );
}
