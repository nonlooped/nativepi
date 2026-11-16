import { Component, type ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { usePaneStore } from "../lib/store.ts";
import { useExtensionManagement } from "../lib/extensionManagement.ts";
import SettingsDetails from "./settings/SettingsDetails.tsx";
import { Button } from "./ui/button.tsx";

interface Props {
  name: string;
  extensionId?: string;
  children: ReactNode;
}
interface State {
  error?: string;
}

export default class ExtensionBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <ExtensionFailure name={this.props.name} extensionId={this.props.extensionId} error={this.state.error} retry={() => this.setState({ error: undefined })} />;
    }
    return this.props.children;
  }
}

function ExtensionFailure({ name, extensionId, error, retry }: { name: string; extensionId?: string; error: string; retry: () => void }) {
  const store = usePaneStore();
  return <div role="alert" className="rounded-md bg-muted/30 px-3 py-2 text-xs">
    <p className="flex items-center gap-2 font-medium"><WarningCircleIcon className="shrink-0 text-destructive" />{name} could not display this panel.</p>
    <p className="mt-1 leading-5 text-body-muted-foreground">Your chat is still available. The extension’s tools may still be active.</p>
    <div className="mt-2 flex flex-wrap gap-1"><Button size="xs" variant="outline" onClick={retry}>Retry panel</Button><Button size="xs" variant="ghost" onClick={() => {
      useExtensionManagement.setState({ target: { id: extensionId ?? name, name } });
      store.getState().openSettings("Tools & extensions#packages");
    }}>Manage this extension</Button></div>
    <SettingsDetails id="extension-display-error" title="Error details"><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{error}</pre></SettingsDetails>
  </div>;
}
