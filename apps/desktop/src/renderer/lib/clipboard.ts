import { toast } from "sonner";

/** LAN access uses HTTP, where the asynchronous clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch { /* Try the selection-based browser fallback. */ }
    }
    const active = document.activeElement;
    const selection = window.getSelection();
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    // A modal makes everything outside it inert, including a fallback field.
    (active?.closest('[role="dialog"]') ?? document.body).append(field);
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px";
    try {
      field.focus({ preventScroll: true });
      field.select();
      if (!document.execCommand("copy")) throw new Error("Copy unavailable");
      return true;
    } finally {
      field.remove();
      if (active instanceof HTMLElement) active.focus({ preventScroll: true });
      selection?.removeAllRanges();
      ranges.forEach(range => selection?.addRange(range));
    }
  } catch {
    toast.error("Could not copy. Select the text and use your device’s Copy action.");
    return false;
  }
}

export async function readClipboardText(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch { /* The browser may deny clipboard access even over HTTPS. */ }
  toast.error("Use your device’s Paste action or keyboard shortcut to paste into the terminal.");
  return null;
}

export async function copyDataImage(src: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    toast.error("Image copying requires a secure connection. Save the image to your device instead.");
    return;
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load image (${response.status})`);
  const source = await response.blob();
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not copy image"))), "image/png"),
  );
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
