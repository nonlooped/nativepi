import { useEffect, useRef, useState } from "react";
import { ditherPixels } from "../lib/chat-backgrounds.ts";
import { rippleDither, unionInkBounds, RIPPLE_DURATION_MS, type DitherRipple, type InkBounds } from "../lib/dither-ripples.ts";
import { useReducedMotion } from "../lib/motion.ts";

/** A fixed ink plate with short-lived disturbances in its own dither grid. */
export default function ChatLandscape({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let disposed = false;
    let frame = 0;
    let rippleFrame = 0;
    let dot = 2;
    let base: ImageData | null = null;
    let output: ImageData | null = null;
    let density = new Float32Array(0);
    let field = new Float32Array(0);
    let ripples: DitherRipple[] = [];
    let previousRegion: InkBounds | null = null;
    let lastPointer: { x: number; y: number; at: number } | null = null;
    const host = canvas.closest<HTMLElement>(".app-viewport");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let bounds = canvas.getBoundingClientRect();
    const image = new Image();
    const paint = (pixels: ImageData, region: InkBounds | null) => {
      if (region) context.putImageData(pixels, 0, 0, region.left, region.top, region.right - region.left, region.bottom - region.top);
    };
    const stopRipples = () => {
      cancelAnimationFrame(rippleFrame);
      rippleFrame = 0;
      ripples = [];
      lastPointer = null;
      if (base) paint(base, previousRegion);
      previousRegion = null;
    };
    const animateRipples = (now: number) => {
      rippleFrame = 0;
      if (disposed || !base || !output) return;
      ripples = ripples.filter((ripple) => now - ripple.startedAt < RIPPLE_DURATION_MS);
      output.data.set(base.data);
      const region = rippleDither(output.data, density, field, canvas.width, canvas.height, dot, ripples, now);
      paint(output, unionInkBounds(previousRegion, region));
      previousRegion = region;
      if (ripples.length) rippleFrame = requestAnimationFrame(animateRipples);
    };
    const movePointer = (event: PointerEvent) => {
      if (!base || reducedMotion || !finePointer.matches || event.pointerType !== "mouse" ||
        (event.target instanceof Element && event.target.closest(".settings-viewport"))) return;
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const now = performance.now();
      const distance = lastPointer ? Math.hypot(x - lastPointer.x, y - lastPointer.y) : 0;
      const elapsed = lastPointer ? now - lastPointer.at : 100;
      if (lastPointer && !(distance >= 18 && elapsed >= 32) && !(distance >= 4 && elapsed >= 80)) return;
      const strength = Math.min(1.2, 0.55 + distance / Math.max(16, elapsed) * 0.35);
      ripples = [...ripples.slice(-6), { x, y, startedAt: now, strength }];
      lastPointer = { x, y, at: now };
      if (!rippleFrame) rippleFrame = requestAnimationFrame(animateRipples);
    };
    // Exit ends input, not the waves already released into the background.
    const leavePointer = () => { lastPointer = null; };
    const draw = () => {
      if (disposed || !image.naturalWidth) return;
      stopRipples();
      bounds = canvas.getBoundingClientRect();
      const { width, height } = bounds;
      if (!width || !height) return;
      // Bound work on ultrawide displays; a dot is normally two CSS pixels.
      dot = Math.max(2, width / 1100, height / 900);
      canvas.width = Math.max(1, Math.round(width / dot));
      canvas.height = Math.max(1, Math.round(height / dot));
      // Resolve semantic ink through the browser, including custom oklch themes.
      context.fillStyle = getComputedStyle(canvas).color;
      context.fillRect(0, 0, 1, 1);
      const ink = [...context.getImageData(0, 0, 1, 1).data];
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      density = new Float32Array(canvas.width * canvas.height);
      field = new Float32Array(density.length);
      for (let pixel = 0; pixel < density.length; pixel++) {
        const offset = pixel * 4;
        density[pixel] = 1 - (0.2126 * pixels.data[offset]! + 0.7152 * pixels.data[offset + 1]! + 0.0722 * pixels.data[offset + 2]!) / 255;
      }
      ditherPixels(pixels.data, canvas.width, ink);
      base = pixels;
      context.putImageData(base, 0, 0);
      output = context.getImageData(0, 0, canvas.width, canvas.height);
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
    host?.addEventListener("pointermove", movePointer, { passive: true });
    host?.addEventListener("pointerleave", leavePointer);
    window.addEventListener("blur", stopRipples);
    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      resize.disconnect();
      theme.disconnect();
      cancelAnimationFrame(frame);
      stopRipples();
      host?.removeEventListener("pointermove", movePointer);
      host?.removeEventListener("pointerleave", leavePointer);
      window.removeEventListener("blur", stopRipples);
    };
  }, [src, reducedMotion]);

  return <>
    <div className="chat-landscape" aria-hidden="true">
      <canvas ref={canvasRef} className="chat-dither-plate" />
    </div>
    {failedSource === src ? <p role="status" className="absolute bottom-16 inset-x-4 text-center text-xs text-muted-foreground">Could not load the background. Choose another image in Appearance settings.</p> : null}
  </>;
}
