/**
 * A static field gives the void depth without adding client JavaScript or
 * competing with the window-separation motion.
 */
export function Atmosphere() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 bg-void"
      style={{
        backgroundImage: [
          "radial-gradient(60rem 45rem at 50% 38%, color-mix(in oklab, var(--color-field) 22%, transparent), transparent 70%)",
          "radial-gradient(90rem 60rem at 50% 100%, color-mix(in oklab, var(--color-sidebar) 55%, transparent), transparent 65%)",
        ].join(","),
      }}
    />
  );
}
