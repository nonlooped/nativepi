import { ColumnsPlusRightIcon } from "@phosphor-icons/react/ColumnsPlusRight";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { ColumnsIcon } from "@phosphor-icons/react/Columns";
import { RowsIcon } from "@phosphor-icons/react/Rows";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "./ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu.tsx";
import { useWorkspacePanes } from "../lib/workspacePanes.ts";

export default function WorkspacePaneMenu({ contextual = false }: { contextual?: boolean }) {
  const panes = useWorkspacePanes();
  if (!panes) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="app-no-drag shrink-0" title={contextual ? "Pane actions" : "Conversation layout"} aria-label={contextual ? "Pane actions" : "Conversation layout"} />}>
      {contextual ? <DotsThreeIcon /> : <ColumnsPlusRightIcon />}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <WorkspacePaneActions />
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function WorkspacePaneActions() {
  const panes = useWorkspacePanes();
  if (!panes) return null;
  return <>      <DropdownMenuItem disabled={panes.splitting || panes.count >= 3} onClick={() => panes.split("horizontal")}><ColumnsIcon />Split right</DropdownMenuItem>
      <DropdownMenuItem disabled={panes.splitting || panes.count >= 3} onClick={() => panes.split("vertical")}><RowsIcon />Split below</DropdownMenuItem>
      {panes.count > 1 ? <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => panes.arrange("horizontal")}><ColumnsIcon />Side by side</DropdownMenuItem>
        <DropdownMenuItem onClick={() => panes.arrange("vertical")}><RowsIcon />Stacked</DropdownMenuItem>
        <DropdownMenuSeparator />
        {panes.titles.map((title, index) => <DropdownMenuItem key={index} onClick={() => panes.select(index)}><span className="min-w-0 flex-1 truncate">{title}</span>{index === panes.active ? <span className="text-xs text-muted-foreground">Current</span> : null}</DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => panes.unsplit()}>Keep only this pane</DropdownMenuItem>
        <DropdownMenuItem onClick={() => panes.close(panes.active)}><XIcon />Close pane</DropdownMenuItem>
      </> : null}</>;
}
