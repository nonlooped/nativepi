import { Component, type ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";

interface Props {
  name: string;
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
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WarningCircleIcon className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            Extension “{this.props.name}” failed to render.
            <span className="block text-destructive">{this.state.error}</span>
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
