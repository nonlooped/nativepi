import { CaretLeftIcon } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { Button } from "@/components/ui/button.tsx";
import { useAppStore } from "@/lib/store.ts";
import { createNavigationHistory } from "@/lib/navigationHistory.ts";
import { toast } from "sonner";

const navigation = createNavigationHistory(useAppStore);
if (import.meta.hot) import.meta.hot.dispose(navigation.dispose);

export default function NavigationControls() {
  const canGoBack = navigation.history(s => !s.busy && s.index > 0);
  const canGoForward = navigation.history(s => !s.busy && s.index < s.entries.length - 1);
  function go(direction: -1 | 1) {
    void navigation.navigate(direction).catch(() => toast.error("Could not open this chat."));
  }
  return (
    <nav aria-label="Chat history" className="app-no-drag ml-auto flex shrink-0 items-center">
      <Button variant="ghost" size="icon" disabled={!canGoBack} onClick={() => go(-1)} title="Go back" aria-label="Go back"><CaretLeftIcon className="size-[20px]" /></Button>
      <Button variant="ghost" size="icon" disabled={!canGoForward} onClick={() => go(1)} title="Go forward" aria-label="Go forward"><CaretRightIcon className="size-[20px]" /></Button>
    </nav>
  );
}
