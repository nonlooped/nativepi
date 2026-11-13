import { useEffect, useRef, useState } from "react";
import { ditherPixels } from "../lib/chat-backgrounds.ts";
import { useReducedMotion } from "../lib/motion.ts";

/** A static, low-resolution ink plate; CSS keeps its dots crisp at any DPR. */
export default function ChatLandscape({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let disposed = false;
    let frame = 0;
    let cursorFrame = 0;
    let dot = 2;
    let cursorSize = 320;
    let ink: number[] = [];
    let sceneReady = false;
    const host = canvas.closest<HTMLElement>(".app-viewport");
    const cursor = cursorRef.current;
    const cursorContext = cursor?.getContext("2d", { willReadFrequently: true });
    const photograph = document.createElement("canvas");
    const photoContext = photograph.getContext("2d");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let bounds = canvas.getBoundingClientRect();
    let pointer: { x: number; y: number; targetX: number; targetY: number } | null = null;
    const image = new Image();
    const hideCursor = () => {
      if (cursor) cursor.style.opacity = "0";
      cancelAnimationFrame(cursorFrame);
      cursorFrame = 0;
      pointer = null;
    };
    const drawCursor = () => {
      cursorFrame = 0;
      if (disposed || !pointer || !cursor || !cursorContext || !sceneReady) return;
      const dx = pointer.targetX - pointer.x;
      const dy = pointer.targetY - pointer.y;
      pointer.x += dx * 0.22;
      pointer.y += dy * 0.22;
      const size = cursorSize;
      const radius = size / 2;
      const cells = Math.max(1, Math.round(size / dot));
      if (cursor.width !== cells) cursor.width = cursor.height = cells;
      // A small lens pulls the ink toward the pointer. Only this bounded patch
      // is sampled and dithered while moving; the full photograph stays cached.
      const sample = size / dot / 1.045;
      cursorContext.clearRect(0, 0, cells, cells);
      cursorContext.drawImage(photograph,
        pointer.x / dot - sample / 2 - Math.max(-6, Math.min(6, dx / dot * 0.12)),
        pointer.y / dot - sample / 2 - Math.max(-6, Math.min(6, dy / dot * 0.12)),
        sample, sample, 0, 0, cells, cells);
      const pixels = cursorContext.getImageData(0, 0, cells, cells);
      ditherPixels(pixels.data, cells, ink);
      cursorContext.putImageData(pixels, 0, 0);
      cursor.style.transform = `translate3d(${pointer.x - radius}px, ${pointer.y - radius}px, 0)`;
      cursor.style.opacity = "1";
      if (Math.abs(dx) + Math.abs(dy) > 0.25) cursorFrame = requestAnimationFrame(drawCursor);
    };
    const moveCursor = (event: PointerEvent) => {
      if (reducedMotion || !finePointer.matches || event.pointerType !== "mouse" ||
        (event.target instanceof Element && event.target.closest(".settings-viewport"))) {
        hideCursor();
        return;
      }
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      pointer = pointer ? { ...pointer, targetX: x, targetY: y } : { x, y, targetX: x, targetY: y };
      if (!cursorFrame) cursorFrame = requestAnimationFrame(drawCursor);
    };
    const draw = () => {
      if (disposed || !image.naturalWidth) return;
      bounds = canvas.getBoundingClientRect();
      cursorSize = cursor?.getBoundingClientRect().width ?? 320;
      const { width, height } = bounds;
      if (!width || !height) return;
      // Bound work on ultrawide displays; a dot is normally two CSS pixels.
      dot = Math.max(2, width / 1100, height / 900);
      canvas.width = Math.max(1, Math.round(width / dot));
      canvas.height = Math.max(1, Math.round(height / dot));
      // Resolve semantic ink through the browser, including custom oklch themes.
      context.fillStyle = getComputedStyle(canvas).color;
      context.fillRect(0, 0, 1, 1);
      ink = [...context.getImageData(0, 0, 1, 1).data];
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      photograph.width = canvas.width;
      photograph.height = canvas.height;
      photoContext?.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      ditherPixels(pixels.data, canvas.width, ink);
      context.putImageData(pixels, 0, 0);
      sceneReady = !!photoContext;
      if (cursor && host) cursor.style.backgroundColor = getComputedStyle(host).backgroundColor;
      hideCursor();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    image.onload = schedule;
    image.onerror = () => { if (!disposed) setFailedSource(src); };
    image.src = src;
    const resize = new ResizeObserver(schedule);
    resize.observe(canvas);
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    host?.addEventListener("pointermove", moveCursor, { passive: true });
    host?.addEventListener("pointerleave", hideCursor);
    window.addEventListener("blur", hideCursor);
    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      resize.disconnect();
      theme.disconnect();
      cancelAnimationFrame(frame);
      hideCursor();
      host?.removeEventListener("pointermove", moveCursor);
      host?.removeEventListener("pointerleave", hideCursor);
      window.removeEventListener("blur", hideCursor);
    };
  }, [src, reducedMotion]);

  return <>
    <div className="chat-landscape" aria-hidden="true">
      <canvas ref={canvasRef} className="chat-dither-plate" />
      {!reducedMotion ? <canvas ref={cursorRef} className="chat-dither-cursor" /> : null}
    </div>
    {failedSource === src ? <p role="status" className="absolute bottom-16 inset-x-4 text-center text-xs text-muted-foreground">Could not load the background. Choose another image in Appearance settings.</p> : null}
  </>;
}
