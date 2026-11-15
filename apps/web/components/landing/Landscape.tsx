"use client";

import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

const vertex = `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = `
  precision highp float;
  uniform sampler2D uImage;
  uniform vec2 uSize;
  uniform float uTime;
  uniform float uDriftTime;
  uniform vec4 uWaves[6];
  varying vec2 vUv;

  // Recursive Bayer thresholds keep the ordered grid fixed as density changes.
  float bayer2(vec2 p) {
    p = mod(floor(p), 2.0);
    return mod(2.0 * p.x + 3.0 * p.y, 4.0);
  }
  float threshold(vec2 p) {
    return (16.0 * bayer2(p) + 4.0 * bayer2(p / 2.0) + bayer2(p / 4.0) + 0.5) / 64.0;
  }
  void main() {
    float dotSize = 2.0;
    vec2 grid = floor(vUv * uSize / dotSize);
    vec2 point = (grid + 0.5) * dotSize;
    vec2 uv = point / uSize;
    float ratio = uSize.x / uSize.y;
    vec2 cover = vec2(min(1.0, ratio / 1.5), min(1.0, 1.5 / ratio));
    vec2 imageUv = (uv - 0.5) * cover + 0.5;
    // Drift is under three source pixels, over tens of seconds. The dot grid stays still.
    imageUv += vec2(sin(uDriftTime * 0.09), sin(uDriftTime * 0.07)) * 0.002;
    float luminance = dot(texture2D(uImage, imageUv).rgb, vec3(0.2126, 0.7152, 0.0722));
    float density = clamp((1.0 - luminance) * 0.8 - 0.04, 0.0, 0.8);
    density += sin(uv.x * 5.0 + uv.y * 3.0 + uDriftTime * 0.12) * 0.008;
    for (int i = 0; i < 6; i++) {
      float age = uTime - uWaves[i].z;
      if (age >= 0.0 && age < 1.2) {
        float radius = 12.0 + age * 135.0;
        float band = (distance(point, uWaves[i].xy) - radius) / 28.0;
        if (abs(band) < 1.0) {
          density += sin(band * 3.14159) * pow(1.0 - abs(band), 2.0)
            * 0.32 * pow(1.0 - age / 1.2, 1.7) * uWaves[i].w;
        }
      }
    }
    float ink = step(threshold(grid), density);
    gl_FragColor = vec4(vec3(0.62, 0.62, 0.59), ink);
  }
`;

/** A quiet, 30fps living plate with a static presentation when motion is paused. */
export function Landscape() {
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const wakeRef = useRef<() => void>(() => {});
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import("ogl").then(({ Renderer, Triangle, Program, Mesh, Texture }) => {
      if (disposed) return;
      let renderer: InstanceType<typeof Renderer>;
      try {
        renderer = new Renderer({ alpha: true, dpr: 1, depth: false, antialias: false, webgl: 1 });
      } catch {
        host.dataset.fallback = "true";
        return; // The pre-rendered plate is also the no-WebGL presentation.
      }
      const gl = renderer.gl;
      const canvas = gl.canvas;
      host.appendChild(canvas);
      const texture = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
      const geometry = new Triangle(gl);
      // OGL recognizes flat JS arrays as array uniforms (typed arrays are walked as structs).
      const waves = Array<number>(24).fill(0);
      for (let i = 0; i < 6; i++) waves[i * 4 + 2] = -100;
      const program = new Program(gl, {
        vertex, fragment, depthTest: false, depthWrite: false,
        uniforms: {
          uImage: { value: texture }, uSize: { value: [1, 1] },
          uTime: { value: 0 }, uDriftTime: { value: 0 }, uWaves: { value: waves },
        },
      });
      const mesh = new Mesh(gl, { geometry, program });
      let frame = 0;
      let loaded = false;
      let visible = true;
      let lastImpulse = -100;
      let index = 0;
      let lastPaint = -100;
      let lastTick = 0;
      let bounds = host.getBoundingClientRect();
      // A cached image can decode before ResizeObserver delivers its first entry.
      // Size the drawing buffer and uniforms before any frame can become visible.
      renderer.setSize(Math.round(bounds.width), Math.round(bounds.height));
      program.uniforms.uSize.value = [bounds.width, bounds.height];
      const draw = (now: number) => {
        frame = 0;
        if (!loaded || !visible || disposed || document.hidden || gl.isContextLost()) { lastTick = 0; return; }
        const moving = !motion.matches && !pausedRef.current;
        if (moving) {
          frame = requestAnimationFrame(draw);
          if (now - lastPaint < 1000 / 30) return;
          if (lastTick) program.uniforms.uDriftTime.value += Math.min(0.05, (now - lastTick) / 1000);
          lastTick = now;
        } else lastTick = 0;
        lastPaint = now;
        program.uniforms.uTime.value = now / 1000;
        renderer.render({ scene: mesh });
      };
      const requestDraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
      const settle = () => {
        lastImpulse = -100;
        for (let i = 0; i < 6; i++) waves[i * 4 + 2] = -100;
        cancelAnimationFrame(frame);
        frame = 0;
        requestDraw();
      };
      wakeRef.current = settle;
      const resize = new ResizeObserver(() => {
        bounds = host.getBoundingClientRect();
        renderer.setSize(Math.round(bounds.width), Math.round(bounds.height));
        program.uniforms.uSize.value = [bounds.width, bounds.height];
        settle();
      });
      resize.observe(host);
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) settle();
        else { cancelAnimationFrame(frame); frame = 0; }
      });
      intersection.observe(host);
      const impulse = (event: PointerEvent | MouseEvent, strength: number) => {
        if (motion.matches || pausedRef.current || !visible) return;
        const now = performance.now() / 1000;
        if (strength < 1 && now - lastImpulse < 0.08) return;
        bounds = host.getBoundingClientRect();
        waves.splice(index * 4, 4, event.clientX - bounds.left, bounds.bottom - event.clientY, now, strength);
        index = (index + 1) % 6;
        lastImpulse = now;
        requestDraw();
      };
      const move = (event: PointerEvent) => {
        if (pointer.matches && event.pointerType === "mouse") impulse(event, 0.65);
      };
      const click = (event: MouseEvent) => {
        if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, h1, p, img, svg, .devices, .platform-marks, .site-notes")) return;
        impulse(event, 2.2);
      };
      const contextLost = (event: Event) => {
        event.preventDefault();
        delete host.dataset.ready;
        host.dataset.fallback = "true";
        cancelAnimationFrame(frame);
        frame = 0;
      };
      const contextRestored = () => {
        // Rebuilding the component is unnecessary; keep the working still fallback.
        delete host.dataset.ready;
        host.dataset.fallback = "true";
      };
      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        texture.image = image;
        loaded = true;
        draw(performance.now());
        if (!gl.isContextLost()) host.dataset.ready = "true";
      };
      image.src = "/landscape/mist.webp";
      host.parentElement?.addEventListener("pointermove", move, { passive: true });
      host.parentElement?.addEventListener("click", click);
      motion.addEventListener("change", settle);
      window.addEventListener("blur", settle);
      document.addEventListener("visibilitychange", settle);
      canvas.addEventListener("webglcontextlost", contextLost);
      canvas.addEventListener("webglcontextrestored", contextRestored);
      cleanup = () => {
        cancelAnimationFrame(frame);
        image.onload = null;
        resize.disconnect();
        intersection.disconnect();
        host.parentElement?.removeEventListener("pointermove", move);
        host.parentElement?.removeEventListener("click", click);
        motion.removeEventListener("change", settle);
        window.removeEventListener("blur", settle);
        document.removeEventListener("visibilitychange", settle);
        canvas.removeEventListener("webglcontextlost", contextLost);
        canvas.removeEventListener("webglcontextrestored", contextRestored);
        geometry.remove();
        program.remove();
        gl.deleteTexture(texture.texture);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.remove();
        delete host.dataset.ready;
        wakeRef.current = () => {};
      };
    }).catch(() => { if (!disposed) host.dataset.fallback = "true"; });

    return () => { disposed = true; cleanup?.(); };
  }, []);

  return <>
    <div ref={hostRef} className="landscape" aria-hidden="true">
      <div className="landscape-still" />
      <noscript><div className="landscape-no-script" /></noscript>
    </div>
    <button
      type="button"
      className="motion-control"
      aria-label={paused ? "Play background animation" : "Pause background animation"}
      title={paused ? "Play background animation" : "Pause background animation"}
      onClick={() => {
        pausedRef.current = !paused;
        setPaused(!paused);
        wakeRef.current();
      }}
    >{paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}</button>
  </>;
}
