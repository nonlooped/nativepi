import { lazy, Suspense } from "react";
import { useAppStore } from "../lib/store.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog.tsx";
import { SettingsDialogAppearance } from "./ui/dialog-styles.ts";
import StateNotice from "./StateNotice.tsx";
const Usage = lazy(() => import("./settings/UsageSettings.tsx"));
const Automations = lazy(() => import("./settings/AutomationSettings.tsx"));
const Access = lazy(() => import("./settings/AccessSettings.tsx"));
const titles = { usage: "Usage", automations: "Automations", access: "Open on another device" };
const descriptions = { usage: "Activity recorded on this computer. Costs are estimates based on API rates.", automations: "Schedule Work tasks and watch GitHub pull requests.", access: "Use NativePi from a browser while this computer stays on." };

export default function AppPanel() {
  const panel = useAppStore(s => s.appPanel);
  const close = useAppStore(s => s.closeAppPanel);
  return <SettingsDialogAppearance value={true}><Dialog open={!!panel} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[min(48rem,calc(var(--app-height,100dvh)-2rem))] w-[calc(100vw-2rem)] max-w-4xl gap-6">
      {panel ? <>
        <DialogHeader><DialogTitle>{titles[panel]}</DialogTitle><DialogDescription>{descriptions[panel]}</DialogDescription></DialogHeader>
        <div className="@container/settings-content min-h-0 min-w-0 overflow-y-auto"><Suspense fallback={<StateNotice loading title="Loading…" />}>
          {panel === "usage" ? <Usage /> : panel === "automations" ? <Automations /> : <Access />}
        </Suspense></div>
      </> : null}
    </DialogContent>
  </Dialog></SettingsDialogAppearance>;
}
