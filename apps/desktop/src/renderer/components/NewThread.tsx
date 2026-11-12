import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import Composer from "./Composer.tsx";

export default function NewThread() {
  const ready = useAppStore((s) => s.providers.some((provider) => provider.ready));
  const loaded = useAppStore((s) => s.providersLoaded);
  const openSettings = useAppStore((s) => s.openSettings);
  if (!loaded) return <p role="status" className="text-center text-sm text-muted-foreground">Checking providers…</p>;
  return ready ? (
    <>
      <h1 className="mb-8 text-center text-balance text-headline" style={{ "--i": 0 } as React.CSSProperties}>What should we work on?</h1>
      <Composer prominent />
    </>
  ) : (
    <div className="text-center">
      <h1 className="text-balance text-headline">Connect a provider</h1>
      <p className="mt-3 text-sm text-muted-foreground">Choose a model provider to start working with Pi.</p>
      <Button size="xl" className="mt-6" onClick={() => openSettings("Providers")}>Connect a provider</Button>
    </div>
  );
}
