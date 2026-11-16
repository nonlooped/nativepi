import { useAppStore } from "../lib/store.ts";
import StateNotice from "./StateNotice.tsx";
import NativePiWordmark from "./NativePiWordmark.tsx";
import { Button } from "@/components/ui/button.tsx";

export default function NewThread() {
  const ready = useAppStore((s) => s.providers.some((provider) => provider.ready));
  const error = useAppStore(s => s.providersError);
  const loading = useAppStore(s => s.providersLoading);
  const reload = useAppStore(s => s.loadProviders);
  const loaded = useAppStore((s) => s.providersLoaded);
  const openSettings = useAppStore((s) => s.openSettings);
  return (
    <div className="new-chat">
      <div className="new-chat-scroll">
        <div className="new-chat-content mx-auto my-auto w-full max-w-(--conversation-width)">
          <div className="mb-6 flex justify-center"><NativePiWordmark display /></div>
          {error && !loading ? <StateNotice title="Could not check providers" detail={error} retry={() => void reload().catch(() => {})} /> : !loaded || loading ? <p role="status" className="text-center text-sm text-muted-foreground">Checking providers…</p> : ready ? null : <div className="text-center">
            <h1 className="new-chat-heading text-balance">Connect an AI account</h1>
            <p className="mt-3 text-sm text-muted-foreground">Choose the AI service you use, then sign in or add an API key. Some services charge separately for API access.</p>
            <Button size="xl" className="mt-6" onClick={() => openSettings("Providers")}>Connect an AI account</Button>
          </div>}
        </div>
      </div>
    </div>
  );
}
