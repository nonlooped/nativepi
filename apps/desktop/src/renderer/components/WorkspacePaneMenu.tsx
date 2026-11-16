import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { ColumnsIcon } from "@phosphor-icons/react/Columns";
import { RowsIcon } from "@phosphor-icons/react/Rows";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "./ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu.tsx";
import { useWorkspacePanes } from "../lib/workspacePanes.ts";

export default function WorkspacePaneMenu() {
  const panes = useWorkspacePanes();
  if (!panes || panes.count < 2) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="app-no-drag shrink-0" title="Pane actions" aria-label="Pane actions" />}>
      <DotsThreeIcon />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <WorkspacePaneActions />
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function WorkspacePaneActions() {
  const panes = useWorkspacePanes();
  if (!panes) return null;
  if (panes.count < 2) return null;
  return <>
    <DropdownMenuItem disabled={panes.splitting} onClick={() => panes.arrange("horizontal")}><ColumnsIcon />Side by side</DropdownMenuItem>
    <DropdownMenuItem disabled={panes.splitting} onClick={() => panes.arrange("vertical")}><RowsIcon />Stacked</DropdownMenuItem>
    <DropdownMenuSeparator />
    {panes.titles.map((title, index) => <DropdownMenuItem key={index} onClick={() => panes.select(index)}><span className="min-w-0 flex-1 truncate">{title}</span>{index === panes.active ? <span className="text-xs text-muted-foreground">Current</span> : null}</DropdownMenuItem>)}
    <DropdownMenuSeparator />
    <DropdownMenuItem disabled={panes.splitting} onClick={() => panes.unsplit()}>Keep only this pane</DropdownMenuItem>
    <DropdownMenuItem disabled={panes.splitting} onClick={() => panes.close(panes.active)}><XIcon />Close pane</DropdownMenuItem>
  </>;
}
