"use client";

import { PiMark } from "@/components/site/Marks";
import { slots } from "@/components/stage/layers";
import { cn } from "@/lib/cn";

/**
 * The faces of the three layers that are not the running interface.
 *
 * Each is a diagram of something real: the RPC transport, the bridge, and the
 * four contribution points. None of them is a decorative texture standing in for
 * an idea, which is the failure mode a stack of glowing plates invites.
 */

export function PiPlate() {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-ink p-5 sm:p-7">
      <div className="flex items-center gap-2.5">
        <PiMark className="size-5 text-chalk" />
        <span className="text-sm font-medium text-chalk">
          pi-coding-agent
        </span>
        <span className="rounded-sm bg-soft px-1.5 py-px font-mono text-xs text-silver">
          RPC
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
        {[
          "agent loop",
          "providers",
          "auth",
          "tools",
          "prompts",
          "skills",
          "extensions",
          "sessions",
        ].map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 font-mono text-xs text-silver"
          >
            <span className="size-1 rounded-full bg-green" />
            {item}
          </div>
        ))}
      </div>

      <div className="font-mono text-xs text-dim">~/.pi/agent</div>
    </div>
  );
}

export function HostPlate() {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-ink p-5 sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-medium text-chalk">Electron main</span>
        <span className="rounded-sm bg-soft px-1.5 py-px font-mono text-xs text-silver">
          contextBridge
        </span>
      </div>

      {/* The transport, drawn as the two directions it actually has. */}
      <div className="space-y-2 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-dim">stdin</span>
          <span className="h-px flex-1 bg-gradient-to-r from-silver/50 to-transparent" />
          <span className="shrink-0 text-silver">prompt, steer, abort</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-dim">stdout</span>
          <span className="h-px flex-1 bg-gradient-to-l from-silver/50 to-transparent" />
          <span className="shrink-0 text-silver">deltas, tools, results</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-dim">
        <span>ELECTRON_RUN_AS_NODE</span>
        <span>one process per project</span>
      </div>
    </div>
  );
}

/**
 * The slot overlay sits in front of the interface rather than replacing it,
 * because that is literally where an extension's contribution lands.
 */
export function SlotOverlay({ revealed }: { revealed: boolean }) {
  return (
    <div className="relative h-full w-full">
      {slots.map((slot) => (
        <div
          key={slot.key}
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out",
            revealed ? "opacity-100" : "opacity-0",
          )}
          style={{
            left: `${slot.x}%`,
            top: `${slot.y}%`,
            transitionDelay: revealed ? `${slots.indexOf(slot) * 90}ms` : "0ms",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-slot motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-slot" />
            </span>
            <span className="whitespace-nowrap rounded-sm border border-slot/40 bg-void/85 px-1.5 py-0.5 text-xs font-medium text-slot backdrop-blur-sm">
              {slot.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
