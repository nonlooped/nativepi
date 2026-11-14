import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";

export default function NewThread() {
  const destination = useAppStore(s => s.destination);
  const ready = useAppStore((s) => s.providers.some((provider) => provider.ready));
  const loaded = useAppStore((s) => s.providersLoaded);
  const openSettings = useAppStore((s) => s.openSettings);
  return (
    <div className="new-chat">
      <div className="new-chat-scroll">
        <div className="new-chat-content mx-auto my-auto w-full max-w-(--conversation-width)">
          {!loaded ? <p role="status" className="text-center text-sm text-muted-foreground">Checking providers…</p> : ready ? <>
            <h1 className="new-chat-heading text-center text-balance">{destination === "chat" ? "What’s on your mind?" : "What should we work on?"}</h1>
          </> : <div className="text-center">
            <h1 className="new-chat-heading text-balance">Connect a provider</h1>
            <p className="mt-3 text-sm text-muted-foreground">Choose a model provider to start working with Pi.</p>
            <Button size="xl" className="mt-6" onClick={() => openSettings("Providers")}>Connect a provider</Button>
          </div>}
        </div>
      </div>
    </div>
  );
}
