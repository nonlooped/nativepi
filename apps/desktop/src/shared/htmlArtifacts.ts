import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";

export const MAX_ARTIFACT_HTML = 512_000;
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const ARTIFACT_WIDTH = 728;
export const MAX_ARTIFACT_HEIGHT = 8_000;
export const artifactSourceSchema = z.object({
  html: z.string().min(1).max(MAX_ARTIFACT_HTML).optional(),
  path: z.string().min(1).max(4096).optional(),
}).refine(value => (value.html !== undefined) !== (value.path !== undefined), "Pass exactly one of html or path.");
export const htmlArtifactSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1).max(200),
  html: z.string().min(1).max(MAX_ARTIFACT_BYTES),
  height: z.number().int().min(80).max(MAX_ARTIFACT_HEIGHT),
});
export type HtmlArtifact = z.infer<typeof htmlArtifactSchema>;
export const artifactThemeSchema = z.object({
  appearance: z.enum(["light", "dark"]),
  variables: z.record(z.string().regex(/^--[a-z0-9-]+$/), z.string().max(500).regex(/^[^;{}<>]*$/)),
});
export type ArtifactTheme = z.infer<typeof artifactThemeSchema>;
export const artifactPreviewInputSchema = z.object({
  html: htmlArtifactSchema.shape.html,
  width: z.number().int().min(240).max(1600).default(ARTIFACT_WIDTH),
  appearance: z.enum(["light", "dark"]).optional(),
});
export const artifactPreviewResultSchema = z.object({
  width: z.number().int().positive(),
  contentHeight: z.number().int().positive(),
  capturedHeight: z.number().int().positive(),
  consoleMessages: z.array(z.object({ level: z.enum(["log", "info", "warn", "error"]), text: z.string().max(2000) })).max(50),
  png: z.string().max(16 * 1024 * 1024),
});
export type ArtifactPreviewInput = z.infer<typeof artifactPreviewInputSchema>;
export type ArtifactPreviewResult = z.infer<typeof artifactPreviewResultSchema>;
export const artifactProcessRequestSchema = z.object({
  type: z.literal("nativepi_artifact_preview"),
  requestId: z.string().max(100),
  input: artifactPreviewInputSchema,
});
export const artifactProcessReplySchema = z.object({
  type: z.literal("nativepi_artifact_preview_reply"),
  requestId: z.string().max(100),
  result: artifactPreviewResultSchema.optional(),
  error: z.string().max(4000).optional(),
});
export const artifactFrameMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nativepi.artifact.size"), height: z.number().finite().positive().max(1_000_000) }),
  z.object({ type: z.literal("nativepi.artifact.console"), level: z.enum(["log", "info", "warn", "error"]), text: z.string().max(2000) }),
  z.object({ type: z.literal("nativepi.artifact.link"), url: z.url().max(4096).refine(url => /^https?:\/\//i.test(url)) }),
]);

// Generated documents are untrusted, including every postMessage they emit.
// No same-origin, network, child frames, forms, popups, or app bridge is exposed.
export const ARTIFACT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const BASE_CSS = "html{color-scheme:inherit;box-sizing:border-box;color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}*,*::before,*::after{box-sizing:inherit}html,body{margin:0;background:transparent}body{display:flow-root;overflow-wrap:anywhere}img,svg,canvas{max-width:100%}pre{overflow:auto}button,input,select,textarea{font:inherit;color:inherit}code,pre,kbd,samp{font-family:var(--font-mono)}:focus-visible{outline:2px solid var(--ring);outline-offset:-2px}";

// Theme updates replace this style sheet, preserving the page and its input state.
const BOOTSTRAP = `(() => {
  const post = data => parent.postMessage(data, '*');
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'nativepi.artifact.theme') return;
    const theme = event.data.theme;
    if (!theme || !['light','dark'].includes(theme.appearance)) return;
    document.documentElement.style.colorScheme = theme.appearance;
    for (const [name, value] of Object.entries(theme.variables || {})) {
      if (/^--[a-z0-9-]+$/.test(name) && typeof value === 'string' && !/[;{}<>]/.test(value)) document.documentElement.style.setProperty(name, value);
    }
    dispatchEvent(new Event('nativepi-theme-change'));
  });
  for (const level of ['log','info','warn','error']) {
    const original = console[level];
    console[level] = (...args) => { original.apply(console, args); post({ type:'nativepi.artifact.console', level, text:args.map(value => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); } }).join(' ').slice(0,2000) }); };
  }
  addEventListener('error', event => post({type:'nativepi.artifact.console',level:'error',text:String(event.message).slice(0,2000)}));
  addEventListener('unhandledrejection', event => post({type:'nativepi.artifact.console',level:'error',text:String(event.reason).slice(0,2000)}));
  let lastHeight = 0;
  const measure = () => {
    const body = document.body;
    if (!body) return;
    const height = Math.max(80, Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)));
    if (height !== lastHeight) { lastHeight = height; post({type:'nativepi.artifact.size',height}); }
  };
  addEventListener('DOMContentLoaded', () => { new ResizeObserver(measure).observe(document.body); measure(); });
  addEventListener('load', measure);
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const href = link.getAttribute('href');
    if (href?.startsWith('#')) return;
    event.preventDefault();
    if (event.isTrusted && /^https?:\\/\\//i.test(href || '')) post({type:'nativepi.artifact.link',url:href});
  });
})();`;

type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];
export function visitHtmlElements(node: Node, visit: (element: Element) => void): void {
  if ("tagName" in node) visit(node);
  if ("childNodes" in node) for (const child of node.childNodes) visitHtmlElements(child, visit);
}

/** Insert policy and bootstrap before author code, using HTML parsing rather than string matching. */
export function htmlArtifactDocument(html: string, theme: ArtifactTheme): string {
  const document = parse(html);
  const root = document.childNodes.find((node): node is Element => "tagName" in node && node.tagName === "html");
  const head = root?.childNodes.find((node): node is Element => "tagName" in node && node.tagName === "head");
  const parsedTheme = artifactThemeSchema.parse(theme);
  const variables = Object.entries(parsedTheme.variables).map(([name, value]) => `${name}:${value}`).join(";");
  const fragment = parseFragment(`<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:${parsedTheme.appearance};${variables}}${BASE_CSS}</style><script>${BOOTSTRAP}</script>`);
  if (head) {
    for (const child of fragment.childNodes) child.parentNode = head;
    head.childNodes.unshift(...fragment.childNodes);
  }
  return serialize(document);
}

export function artifactFromDetails(details: unknown): HtmlArtifact | undefined {
  if (!details || typeof details !== "object" || !("htmlArtifact" in details)) return undefined;
  const parsed = htmlArtifactSchema.safeParse(details.htmlArtifact);
  return parsed.success ? parsed.data : undefined;
}
