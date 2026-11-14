import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse, serialize } from "parse5";
import { Type } from "typebox";
import {
  ARTIFACT_WIDTH, MAX_ARTIFACT_BYTES, MAX_ARTIFACT_HEIGHT, MAX_ARTIFACT_HTML,
  artifactProcessReplySchema, artifactSourceSchema, htmlArtifactSchema, visitHtmlElements,
  type ArtifactPreviewInput, type ArtifactPreviewResult,
} from "../../../shared/htmlArtifacts.ts";

export const ARTIFACT_INSTRUCTIONS = `## Inline visuals
Use inline HTML artifacts proactively when a chart, diagram, interactive explanation, comparison, timeline, or small simulator communicates the answer better than prose. Use ordinary text for simple answers. Artifacts are available in both Chat and Work, including without a project.
Create a self-contained HTML page with inline CSS and JavaScript. Call html_preview, inspect the screenshot and console output, improve the page if needed, then call html_render to show the finished visual directly above your reply. A preview alone does not show the reader an artifact. Do not start a server or open a browser to deliver it. Explain only what the visual does not already say.
Use the supplied theme variables: --background, --foreground, --card, --card-foreground, --muted, --muted-foreground, --border, --primary, --primary-foreground, --accent, --success, --warning, --info, --destructive, --chart-1 through --chart-5, --radius, --font-sans, --font-mono. Do not hardcode page colors. Canvas charts should redraw on the nativepi-theme-change window event.
The frame follows the conversation width (about ${ARTIFACT_WIDTH}px on desktop, 360px on phones). Leave html, body, and the outer container transparent, with no outer card, banner title, or side padding. Give individual surfaces sensible spacing. Let content determine height; do not use vh units or height:100% on html/body. Use fluid layouts, readable labels, and fixed chart heights. JavaScript can provide local interactivity but cannot access the app, files, network, external libraries, or nested frames. Inline assets; local PNG/JPEG/GIF/WebP img sources are embedded by the tools. No remote assets load.
Prefer passing html directly, especially in Chat, where workspace files must not be created. Work may pass an absolute HTML file path instead. Artifact presentation and its session snapshot are allowed in Chat; they are not workspace edits.`;

async function readBounded(file: string, limit: number): Promise<Buffer> {
  if (!path.isAbsolute(file) || /^(?:\\\\|\/\/)/.test(file)) throw new Error("Use an absolute local file path.");
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw new Error(`Expected a regular file smaller than ${limit} bytes.`);
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > limit) throw new Error(`File exceeds ${limit} bytes.`);
    return buffer.subarray(0, size);
  } finally { await handle.close(); }
}

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

export async function prepareArtifactSource(input: unknown, cwd: string, signal?: AbortSignal): Promise<string> {
  const source = artifactSourceSchema.parse(input);
  let html = source.html;
  let baseDir = cwd;
  if (source.path) {
    if (!path.isAbsolute(source.path) || /^(?:\\\\|\/\/)/.test(source.path)) throw new Error("Use an absolute local HTML file path.");
    const file = await realpath(source.path);
    if (!/\.html?$/i.test(file)) throw new Error("The source must be an HTML file.");
    html = (await readBounded(file, MAX_ARTIFACT_HTML)).toString("utf8");
    baseDir = path.dirname(file);
  }
  signal?.throwIfAborted();
  const document = parse(html!);
  const images: { value: string; set: (value: string) => void }[] = [];
  visitHtmlElements(document, element => {
    const css = element.tagName === "style"
      ? element.childNodes.flatMap(node => "value" in node ? [node.value] : []).join("")
      : element.attrs.find(attr => attr.name === "style")?.value ?? "";
    if (/(?<![\w.+/])(?:\d+(?:\.\d+)?|\.\d+)[sld]?vh(?![\w-])/i.test(css)) {
      throw new Error("Do not use viewport-height units in an auto-sizing artifact. Let content set its height or use pixels.");
    }
    if (element.tagName !== "img") return;
    const src = element.attrs.find(attr => attr.name === "src");
    if (src && src.value && !/^(?:data:|https?:|blob:|\/\/|#)/i.test(src.value)) {
      images.push({ value: src.value, set: value => { src.value = value; } });
    }
  });
  let total = Buffer.byteLength(html!);
  const embedded = new Map<string, string>();
  for (const image of images) {
    signal?.throwIfAborted();
    const file = path.resolve(baseDir, image.value);
    let data = embedded.get(file);
    if (!data) {
      const bytes = await readBounded(file, MAX_ARTIFACT_BYTES);
      const mime = imageMime(bytes);
      if (!mime) throw new Error(`Unsupported local image: ${image.value}. Use PNG, JPEG, GIF, or WebP.`);
      data = `data:${mime};base64,${bytes.toString("base64")}`;
      embedded.set(file, data);
    }
    total += data.length;
    if (total > MAX_ARTIFACT_BYTES) throw new Error("The artifact and its images exceed 8 MiB.");
    image.set(data);
  }
  const prepared = serialize(document);
  if (Buffer.byteLength(prepared) > MAX_ARTIFACT_BYTES) throw new Error("The artifact exceeds 8 MiB.");
  return prepared;
}

/** Only screenshots cross the child IPC channel; published HTML stays in Pi's session. */
export function requestArtifactPreview(input: ArtifactPreviewInput, signal?: AbortSignal): Promise<ArtifactPreviewResult> {
  return new Promise((resolve, reject) => {
    if (!process.send || !process.connected) { reject(new Error("HTML preview requires NativePi's desktop host.")); return; }
    const requestId = randomUUID();
    const finish = (error?: Error, result?: ArtifactPreviewResult) => {
      clearTimeout(timer);
      process.removeListener("message", onMessage);
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(result!);
    };
    const cancel = () => {
      if (process.connected) process.send?.({ type: "nativepi_artifact_preview_cancel", requestId });
      finish(new Error("HTML preview cancelled."));
    };
    const onMessage = (message: unknown) => {
      const parsed = artifactProcessReplySchema.safeParse(message);
      if (!parsed.success || parsed.data.requestId !== requestId) return;
      finish(parsed.data.error || !parsed.data.result ? new Error(parsed.data.error ?? "HTML preview returned no screenshot.") : undefined, parsed.data.result);
    };
    const timer = setTimeout(cancel, 20_000);
    process.on("message", onMessage);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, { once: true });
    process.send({ type: "nativepi_artifact_preview", requestId, input }, error => { if (error) finish(error); });
  });
}

export function registerArtifacts(pi: ExtensionAPI): void {
  pi.on("before_agent_start", event => ({ systemPrompt: `${event.systemPrompt}\n\n${ARTIFACT_INSTRUCTIONS}` }));
  const source = {
    html: Type.Optional(Type.String({ minLength: 1, maxLength: MAX_ARTIFACT_HTML, description: "Self-contained inline HTML. Pass exactly one of html or path." })),
    path: Type.Optional(Type.String({ maxLength: 4096, description: "Absolute local .html file path (Work only)." })),
  };
  pi.registerTool({
    name: "html_preview", label: "Preview HTML",
    description: "Inspect an HTML artifact before publishing: returns a screenshot, contentHeight, and console output. Does not show it in the conversation. Use theme variables and self-contained CSS/JS; no network assets load.",
    parameters: Type.Object({ ...source, width: Type.Optional(Type.Integer({ minimum: 240, maximum: 1600, description: "Default 728. Also check about 360 for a responsive visual." })), appearance: Type.Optional(Type.Union([Type.Literal("light"), Type.Literal("dark")])) }),
    async execute(_id, params, signal, _update, context) {
      const html = await prepareArtifactSource(params, context.cwd, signal);
      const { png, ...result } = await requestArtifactPreview({ html, width: params.width ?? ARTIFACT_WIDTH, appearance: params.appearance }, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }, { type: "image", mimeType: "image/png", data: png }], details: result };
    },
  });
  pi.registerTool({
    name: "html_render", label: "Show HTML artifact",
    description: "Show a finished interactive HTML visual inline above your reply. Preview and refine it with html_preview first. Returns a durable snapshot in this Pi session. Use the preview's contentHeight. Do not restate what the visual already explains.",
    parameters: Type.Object({ ...source, title: Type.String({ minLength: 1, maxLength: 200 }), height: Type.Integer({ minimum: 80, maximum: MAX_ARTIFACT_HEIGHT }) }),
    async execute(_id, params, signal, _update, context) {
      const html = await prepareArtifactSource(params, context.cwd, signal);
      signal?.throwIfAborted();
      const htmlArtifact = htmlArtifactSchema.parse({ version: 1, title: params.title, height: params.height, html });
      return { content: [{ type: "text", text: `Shown inline: ${htmlArtifact.title}. Reply with any explanation the visual does not already provide.` }], details: { htmlArtifact } };
    },
  });
}
