"use client";

import {
  LazyMotion,
  domAnimation,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState } from "react";

import { AppWindow } from "@/components/app/AppWindow";
import {
  HostPlate,
  PiPlate,
  SlotOverlay,
} from "@/components/stage/LayerPlates";
import { Hero, ScrollCue } from "@/components/stage/Hero";
import { layers } from "@/components/stage/layers";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * The window, pinned at viewport center, coming apart along its Z axis.
 *
 * This is the page's one authored motion idea, and the hero lives inside it
 * rather than above it: there is a single window on this page, and it never
 * leaves the center of the stage. Scroll does not move it, scroll separates it.
 *
 * Below 900px, and under reduced motion, the same four layers render as a plain
 * vertical sequence. Nothing is lost but the third dimension: layer names,
 * annotations, and facts are text in both arrangements.
 */

/** Scroll spent opening the window, before the arrangement holds. */
const OPEN_START = 0.2;
const OPEN_END = 0.86;

/** The window screenshot's aspect ratio, which every frame around it follows. */
const RATIO = 1917 / 1016;

function LayerFace({ id }: { id: string }) {
  if (id === "pi") return <PiPlate />;
  if (id === "host") return <HostPlate />;
  if (id === "renderer") return <AppWindow />;
  return null;
}

function Plate({
  index,
  progress,
  active,
}: {
  index: number;
  progress: MotionValue<number>;
  active: boolean;
}) {
  const layer = layers[index];
  const isSlots = layer.id === "slots";

  const z = useTransform(progress, [OPEN_START, OPEN_END], [0, layer.depth]);
  const y = useTransform(
    progress,
    [OPEN_START, OPEN_END],
    [0, layer.depth * -0.14],
  );

  // Layers that are not the focus recede in contrast rather than in position, so
  // the whole arrangement stays legible while attention moves through it.
  const opacity = useTransform(
    progress,
    [OPEN_START, OPEN_START + 0.06, OPEN_END],
    isSlots ? [0, 0, 1] : [1, 1, active ? 1 : 0.5],
  );

  return (
    <m.div
      style={{ z, y, opacity, transformStyle: "preserve-3d" }}
      className={cn(
        "stage-plate absolute inset-0 overflow-hidden rounded-xl border border-hairline",
        // Plate Cast and Edge Light: a real offset and a real blur.
        "shadow-[inset_0_1px_0_0_oklch(1_0_0/7%),0_40px_90px_-28px_oklch(0_0_0/75%)]",
        isSlots && "border-slot/25 bg-transparent shadow-none",
      )}
    >
      {isSlots ? (
        <SlotOverlay revealed={active} />
      ) : (
        <LayerFace id={layer.id} />
      )}

      {/* The plate's name is printed on the plate, so position never carries it alone. */}
      <m.div
        style={{ opacity: useTransform(progress, [OPEN_START, OPEN_START + 0.08], [0, 1]) }}
        className={cn(
          "pointer-events-none absolute left-3 top-3 rounded-sm bg-void/85 px-1.5 py-0.5 text-xs font-medium backdrop-blur-sm",
          isSlots ? "text-slot" : "text-silver",
        )}
      >
        {layer.name}
      </m.div>
    </m.div>
  );
}

function Annotation({ index, active }: { index: number; active: boolean }) {
  const layer = layers[index];

  return (
    <div
      className={cn(
        "stage-annotation pointer-events-none absolute inset-x-0 bottom-0 transition-[transform,opacity] duration-500 ease-out",
        active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
      aria-hidden="true"
    >
      {/* A scrim, so the annotation stays readable if a plate drifts behind it. */}
      <div className="bg-gradient-to-t from-void via-void/90 to-transparent pt-16">
        <div className="rail pb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-slot">
              {layer.owner}
            </p>
            <h2 className="section-head mt-2 text-bright">{layer.heading}</h2>
            <p className="mt-3 text-sm leading-relaxed text-silver">
              {layer.body}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The below-900px and reduced-motion arrangement: the same content, stacked. */
function StackedLayers() {
  return (
    <div className="rail space-y-16 py-20">
      {layers.map((layer) => (
        <section key={layer.id}>
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-slot">
            {layer.owner}
          </p>
          <h2 className="section-head mt-2 text-bright">{layer.heading}</h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-silver">
            {layer.body}
          </p>

          <div className="plate mt-6 aspect-[1917/1016] overflow-hidden">
            {layer.id === "slots" ? (
              <div className="relative h-full w-full bg-ink">
                <AppWindow />
                <div className="absolute inset-0">
                  <SlotOverlay revealed />
                </div>
              </div>
            ) : (
              <LayerFace id={layer.id} />
            )}
          </div>

          <ul className="mt-5 space-y-2">
            {layer.facts.map((fact) => (
              <li
                key={fact}
                className="flex gap-2.5 text-sm leading-relaxed text-silver"
              >
                <span className="mt-2 size-1 shrink-0 rounded-full bg-slot" />
                {fact}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function WindowStage() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The 3D arrangement is what the markup ships as, so search engines and
  // no-JS clients get the full text and desktop visitors get no swap at all.
  const reduced = usePrefersReducedMotion(false);
  const wide = useMediaQuery("(min-width: 900px)", true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [stage, setStage] = useState({ width: 0, y: 0, scale: 1 });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.0005,
  });

  // At rest the window is untransformed, so its size and position come from the
  // layout: it fills the room the hero leaves and nothing else. Separation is the
  // only state that needs numbers, and those are measured. It tilts once, early.
  // A tilt that keeps moving for the whole section reads as drift, not decision.
  const rotateX = useTransform(progress, [0, OPEN_START, 1], [7, 18, 20]);
  const rotateZ = useTransform(progress, [0, OPEN_START, 1], [0, -1.5, -2]);
  const scale = useTransform(
    progress,
    [0, OPEN_START, 1],
    [1, stage.scale, stage.scale],
  );
  const shiftY = useTransform(
    progress,
    [0, OPEN_START, 1],
    [0, stage.y, stage.y - 6],
  );

  const heroOpacity = useTransform(progress, [0, 0.07, 0.13], [1, 1, 0]);
  const heroY = useTransform(progress, [0, 0.13], [0, -40]);
  const cueOpacity = useTransform(progress, [0, 0.04], [1, 0]);

  useMotionValueEvent(progress, "change", (value) => {
    if (value < OPEN_START + 0.04) {
      setActiveIndex(-1);
      return;
    }

    // Attention walks back to front: Pi, host, renderer, slots.
    const span = (OPEN_END - OPEN_START) / layers.length;
    const next = Math.floor((value - OPEN_START) / span);
    setActiveIndex(Math.min(layers.length - 1, Math.max(0, next)));
  });

  /**
   * Work out where the separated window has to go.
   *
   * The window rests in whatever room the hero leaves, which the frame element
   * already measures for us. Its width is set from that room rather than from a
   * max-height, because a max-height against a definite width crops the window
   * instead of shrinking it. Separation is the state with a fixed destination:
   * centered on the stage, small enough that four spread plates and an
   * annotation share one viewport.
   */
  useEffect(() => {
    if (!wide || reduced) return;

    const measure = () => {
      const frame = frameRef.current;
      if (!frame?.clientHeight) return;

      const viewport = window.innerHeight;
      // The window is allowed to run past the fold, which is what makes it worth
      // scrolling; it is never allowed to run into the copy above it.
      const room = frame.clientHeight + viewport * 0.16;
      const width = Math.min(1248, window.innerWidth * 0.92, room * RATIO);

      // The separated size is bounded by height too, since the annotations take
      // the bottom of the stage and the plates tilt into the space above.
      const target = Math.min(960, window.innerWidth * 0.82, viewport * 0.9);

      setStage({
        width,
        scale: target / width,
        // 46% matches the perspective origin, so the arrangement opens around
        // the same point the projection is drawn from.
        y: viewport * 0.46 - (frame.offsetTop + width / RATIO / 2),
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(frameRef.current!);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide, reduced]);

  if (reduced || !wide) {
    return (
      <>
        <section className="pt-28 pb-4">
          <Hero />
          <div className="rail mt-12">
            <div className="plate aspect-[1917/1016] overflow-hidden">
              <AppWindow />
            </div>
          </div>
        </section>
        <section id="layers" aria-label="How NativePi is put together">
          <StackedLayers />
        </section>
      </>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <section
        ref={sectionRef}
        className="stage-section relative h-[320vh]"
        aria-label="NativePi, and how it is put together"
      >
      {/*
        The section starts at the hero, so #layers cannot live on the section
        itself or the nav link would just scroll to the top of the page. This
        anchor sits at the scroll offset where separation actually begins:
        OPEN_START of the 220vh of travel this 320vh section provides.
      */}
      <div id="layers" className="absolute top-[44vh] h-px w-px" aria-hidden />
      <div className="stage-sticky sticky top-0 flex h-screen flex-col justify-start overflow-hidden pt-[clamp(4rem,8vh,6rem)]">
        {/* Hero copy, occupying the space above the closed window. */}
        <m.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10"
        >
          <Hero />
        </m.div>

        <div className="sr-only">
          <h2>How NativePi is put together</h2>
          <ol>
            {layers.map((layer) => (
              <li key={layer.id}>
                <h3>{layer.heading}</h3>
                <p>{layer.body}</p>
                <ul>
                  {layer.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>

        {/*
          The cue sits between the copy and the window rather than pinned to the
          bottom of the stage. Pinned, it lands on top of the interface it is
          pointing at; here it points at the window and says what scrolling does
          to it.
        */}
        <m.div
          style={{ opacity: cueOpacity, y: heroY }}
          className="relative z-10 mt-6 flex justify-center"
        >
          <ScrollCue />
        </m.div>

        {/*
          The stage: one window, never duplicated. It is a plain flex child, so
          the room the hero leaves is the room it gets, at every viewport and
          before any JavaScript runs.
        */}
        <div
          ref={frameRef}
          aria-hidden="true"
          className="stage-scene relative mt-6 flex min-h-[34vh] flex-1 items-start justify-center"
          style={{ perspective: "2200px", perspectiveOrigin: "50% 46%" }}
        >
          <m.div
            style={{
              rotateX,
              rotateZ,
              scale,
              y: shiftY,
              transformStyle: "preserve-3d",
              // Until the frame has been measured, the CSS below holds the ratio
              // and the width, which is what server-rendered and no-JS clients
              // get: a window that may run past the fold, never a distorted one.
              width: stage.width || undefined,
            }}
            className="relative aspect-[1917/1016] w-full max-w-[min(78rem,92vw)]"
          >
            {layers.map((layer, index) => (
              <Plate
                key={layer.id}
                index={index}
                progress={progress}
                active={activeIndex === index}
              />
            ))}
          </m.div>
        </div>

        {layers.map((layer, index) => (
          <Annotation
            key={layer.id}
            index={index}
            active={activeIndex === index}
          />
        ))}
      </div>
      </section>
    </LazyMotion>
  );
}
