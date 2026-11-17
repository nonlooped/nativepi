import { useEffect, useRef, useState } from "react";

/** React focus events include portalled menus belonging to this composer. */
export function useComposerFocus() {
  const [within, setWithin] = useState(false);
  const pending = useRef<number | null>(null);
  const cancel = () => {
    if (pending.current !== null) window.cancelAnimationFrame(pending.current);
    pending.current = null;
  };
  useEffect(() => () => {
    if (pending.current !== null) window.cancelAnimationFrame(pending.current);
  }, []);
  return {
    within,
    onFocusCapture: () => { cancel(); setWithin(true); },
    onBlurCapture: () => {
      cancel();
      // Wait for the next focus event, including a Base UI portal or its
      // returning trigger, before deciding the person left the composer.
      pending.current = window.requestAnimationFrame(() => {
        pending.current = null;
        setWithin(false);
      });
    },
  };
}
