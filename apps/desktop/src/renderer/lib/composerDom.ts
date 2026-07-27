import { chipText, parseSegments, type ChipKind } from "./composerText.ts";
import { fileIconUrl } from "./fileIcons.ts";

/**
 * The bridge between a draft string and the editable element showing it.
 *
 * Everything here is a translation in one direction or the other: text into
 * nodes, nodes back into text, a caret into an offset and an offset back into a
 * caret. The editor component holds no model of its own, so these four are the
 * whole contract — a chip round-trips through `composerText.ts` unchanged, and
 * anything this file cannot recognise is prose.
 */

const CHIP_ATTRIBUTE = "data-chip";

/**
 * A trailing normal space at the end of a contenteditable is collapsed away and
 * the caret lands back on the chip, so gaps after a chip are hard spaces and are
 * read back as ordinary ones.
 */
const HARD_SPACE = " ";

/** Static markup, never user content: the label is set as text, never as HTML. */
const SKILL_GLYPH =
  '<svg viewBox="0 0 16 16" aria-hidden="true" class="size-3 shrink-0"><path fill="currentColor" d="M9.6 1 3 8.6h3.6L6 15l6.6-7.6H9L9.6 1Z"/></svg>';

/**
 * The mark a chip opens with: a bolt for a skill, and for a file the icon of its
 * own type, so a mention of `package.json` reads as that file at a glance rather
 * than as a page with a folded corner.
 */
function chipGlyph(document: Document, kind: ChipKind, value: string): Node {
  if (kind === "skill") {
    const glyph = document.createElement("span");
    glyph.className = "inline-flex shrink-0";
    glyph.innerHTML = SKILL_GLYPH;
    return glyph;
  }

  const icon = document.createElement("img");
  icon.src = fileIconUrl(value);
  icon.alt = "";
  icon.draggable = false;
  icon.className = "size-4 shrink-0 select-none object-contain";
  return icon;
}

const CHIP_CLASS: Record<ChipKind, string> = {
  skill:
    "mx-px inline-flex translate-y-px items-center gap-1 rounded-md border border-info/40 bg-info/10 px-1.5 py-px align-baseline text-sm font-medium leading-5 text-info",
  file:
    "mx-px inline-flex translate-y-px items-center gap-1 rounded-md border bg-muted px-1.5 py-px align-baseline font-mono text-sm leading-5 text-foreground",
};

export function createChip(document: Document, kind: ChipKind, value: string): HTMLElement {
  const chip = document.createElement("span");
  chip.setAttribute(CHIP_ATTRIBUTE, kind);
  chip.setAttribute("data-value", value);
  // Atomic: the caret steps over a chip rather than into it, and Backspace
  // takes the whole thing, which is the behaviour a chip promises by looking
  // like one object.
  chip.contentEditable = "false";
  chip.className = CHIP_CLASS[kind];
  chip.appendChild(chipGlyph(document, kind, value));
  chip.appendChild(document.createTextNode(kind === "file" ? basename(value) : value));
  chip.title = kind === "skill" ? `Skill: ${value}` : value;
  return chip;
}

/** Chips show the name; the path is in the tooltip and in the text Pi receives. */
function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function chipKind(node: Node): ChipKind | null {
  if (!(node instanceof HTMLElement)) return null;
  const kind = node.getAttribute(CHIP_ATTRIBUTE);
  return kind === "skill" || kind === "file" ? kind : null;
}

/** The draft behind a subtree, chips included. */
export function serialize(root: Node): string {
  let out = "";

  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      const kind = chipKind(child);
      if (kind) {
        out += chipText(kind, (child as HTMLElement).getAttribute("data-value") ?? "");
      } else if (child.nodeType === Node.TEXT_NODE) {
        out += (child.nodeValue ?? "").replaceAll(HARD_SPACE, " ");
      } else if (child instanceof HTMLElement && child.tagName === "BR") {
        out += "\n";
      } else if (child instanceof HTMLElement) {
        // Browsers wrap lines in blocks of their own choosing when Enter is
        // pressed; each one that is not the first starts a line.
        if (isBlock(child) && out !== "" && !out.endsWith("\n")) out += "\n";
        walk(child);
      }
    }
  };

  walk(root);
  return out;
}

function isBlock(element: HTMLElement): boolean {
  return element.tagName === "DIV" || element.tagName === "P";
}

/** Replace the editor's content with `text`, chips and all. */
export function render(root: HTMLElement, text: string): void {
  const document = root.ownerDocument;
  const nodes: Node[] = [];

  for (const segment of parseSegments(text)) {
    if (segment.kind !== "text") {
      nodes.push(createChip(document, segment.kind, segment.value));
      continue;
    }
    const lines = segment.value.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) nodes.push(document.createElement("br"));
      if (line) nodes.push(document.createTextNode(line));
    });
  }

  root.replaceChildren(...nodes);
}

/** How far into the draft the collapsed caret sits, or `null` if it is elsewhere. */
export function caretOffset(root: HTMLElement): number | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  // Serializing everything before the caret reuses the one definition of what
  // the text is, rather than a second walk that could count chips differently.
  const before = root.ownerDocument.createRange();
  before.setStart(root, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const holder = root.ownerDocument.createElement("div");
  holder.appendChild(before.cloneContents());
  return serialize(holder).length;
}

/** The DOM position a draft offset names, for turning an offset back into a caret. */
function locate(root: HTMLElement, target: number): { node: Node; offset: number } {
  let seen = 0;
  let found: { node: Node; offset: number } | null = null;

  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (found) return;
      const kind = chipKind(child);
      const parent = child.parentNode as Node;
      const index = Array.prototype.indexOf.call(parent.childNodes, child);

      if (kind) {
        const length = chipText(kind, (child as HTMLElement).getAttribute("data-value") ?? "").length;
        if (target <= seen) found = { node: parent, offset: index };
        else if (target < seen + length) found = { node: parent, offset: index + 1 };
        seen += length;
      } else if (child.nodeType === Node.TEXT_NODE) {
        const length = (child.nodeValue ?? "").length;
        if (target <= seen + length) found = { node: child, offset: target - seen };
        seen += length;
      } else if (child instanceof HTMLElement && child.tagName === "BR") {
        if (target <= seen) found = { node: parent, offset: index };
        seen += 1;
      } else {
        walk(child);
      }
    }
  };

  walk(root);
  return found ?? { node: root, offset: root.childNodes.length };
}

/**
 * Swap the draft range `[start, end)` for a chip followed by a space, and leave
 * the caret after that space so the next keystroke continues the sentence.
 */
export function replaceWithChip(root: HTMLElement, start: number, end: number, kind: ChipKind, value: string): void {
  const document = root.ownerDocument;
  const from = locate(root, start);
  const to = locate(root, end);

  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  range.deleteContents();

  const chip = createChip(document, kind, value);
  const space = document.createTextNode(HARD_SPACE);
  range.insertNode(space);
  range.insertNode(chip);

  setCaret(root, space, 1);
}

/**
 * Swap the draft range `[start, end)` for literal text followed by a space.
 *
 * What a command completion needs and a chip cannot give: `/review` is the head
 * of a sentence the user carries on writing, so it has to stay editable text
 * rather than becoming one atomic object the caret steps over.
 */
export function replaceWithText(root: HTMLElement, start: number, end: number, text: string): void {
  const document = root.ownerDocument;
  const from = locate(root, start);
  const to = locate(root, end);

  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  range.deleteContents();

  const node = document.createTextNode(text + HARD_SPACE);
  range.insertNode(node);
  setCaret(root, node, node.length);
}

function setCaret(root: HTMLElement, node: Node, offset: number): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection) return;
  const range = root.ownerDocument.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Put the caret at the very end, after the editor's content is replaced wholesale. */
export function caretToEnd(root: HTMLElement): void {
  setCaret(root, root, root.childNodes.length);
}
