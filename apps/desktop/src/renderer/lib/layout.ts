import { useEffect, useState } from "react";

/**
 * How much room the window has for panes.
 *
 * `wide` docks both side panes, `narrow` moves the context pane into a sheet,
 * and `compact` moves project navigation there too. The thresholds live here
 * rather than in Tailwind breakpoints because the settings screen and the
 * workspace have to agree on them.
 */
export type WorkspaceLayout = "wide" | "narrow" | "compact";

const COMPACT_MAX = 899;
const NARROW_MAX = 1099;
const PHONE_MAX = 639;

function currentWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return "wide";
  if (window.matchMedia(`(max-width: ${COMPACT_MAX}px)`).matches) return "compact";
  if (window.matchMedia(`(max-width: ${NARROW_MAX}px)`).matches) return "narrow";
  return "wide";
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [layout, setLayout] = useState(currentWorkspaceLayout);

  useEffect(() => {
    const narrow = window.matchMedia(`(max-width: ${NARROW_MAX}px)`);
    const compact = window.matchMedia(`(max-width: ${COMPACT_MAX}px)`);
    const update = () => setLayout(currentWorkspaceLayout());
    narrow.addEventListener("change", update);
    compact.addEventListener("change", update);
    update();
    return () => {
      narrow.removeEventListener("change", update);
      compact.removeEventListener("change", update);
    };
  }, []);

  return layout;
}

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(`(max-width: ${PHONE_MAX}px)`).matches);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${PHONE_MAX}px)`);
    const update = () => setPhone(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  return phone;
}
