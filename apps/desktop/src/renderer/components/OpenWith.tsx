import { useEffect, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CodeIcon } from "@phosphor-icons/react/Code";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { toast } from "sonner";
import type { InstalledEditor } from "../../shared/rpc-schema.ts";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { fileManagerName } from "@/lib/paths.ts";
import { rpc } from "@/lib/rpc.ts";
import { useAppStore } from "@/lib/store.ts";
import { cn, NO_DRAG_REGION } from "@/lib/utils.ts";
import BrandIcon from "./BrandIcon.tsx";

const EXPLORER: InstalledEditor = { id: "explorer", name: fileManagerName(), icon: "explorer" };

export default function OpenWith({ projectDir }: { projectDir: string }) {
  const [editors, setEditors] = useState<InstalledEditor[]>([EXPLORER]);
  const selectedId = useAppStore((s) => s.preferences.preferredEditorId);
  const setPreference = useAppStore((s) => s.setPreference);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    void rpc.request
      .listEditors({})
      .then(({ editors: scanned }) => {
        if (!active) return;
        const list = scanned.some((editor) => editor.id === EXPLORER.id)
          ? scanned
          : [EXPLORER, ...scanned];
        setEditors(list);
        const current = useAppStore.getState().preferences.preferredEditorId;
        if (!list.some((editor) => editor.id === current)) setPreference("preferredEditorId", list[0]!.id);
      })
      .catch(() => {
        // Keep the Explorer fallback so the control still works if the scan IPC fails.
      });
    return () => {
      active = false;
    };
  }, [setPreference]);

  const selected = editors.find((editor) => editor.id === selectedId) ?? EXPLORER;

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const result = await rpc.request.openProjectIn({ projectDir, editorId: selected.id });
      if (!result.ok) toast.error(result.error ?? `Could not open ${selected.name}.`);
    } catch {
      toast.error(`Could not open ${selected.name}.`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={cn(NO_DRAG_REGION, "flex items-center")}>
      <Button
        variant="outline"
        onClick={() => void open()}
        disabled={opening}
        title={`Open project in ${selected.name}`}
        aria-label={`Open project in ${selected.name}`}
        className="rounded-r-none border-r-0"
      >
        <EditorIcon editor={selected} />
        Open
      </Button>
      <Menu>
        <MenuTrigger
          render={<Button variant="outline" size="icon" />}
          title="Choose where to open this project"
          aria-label="Choose where to open this project"
          className="rounded-l-none px-1"
        >
          <CaretDownIcon />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-52">
           <MenuGroup>{editors.map((editor) => (
            <MenuItem
              key={editor.id}
              role="menuitemradio"
              aria-checked={editor.id === selectedId}
              onClick={() => setPreference("preferredEditorId", editor.id)}
              className="text-sm"
            >
              <EditorIcon editor={editor} />
              <span className="min-w-0 flex-1 truncate">{editor.name}</span>
              {editor.id === selectedId ? <CheckIcon className="ml-auto" aria-hidden /> : null}
            </MenuItem>
           ))}</MenuGroup>
        </MenuPopup>
      </Menu>
    </div>
  );
}

function EditorIcon({ editor }: { editor: InstalledEditor }) {
  if (editor.iconUrl) return <img src={editor.iconUrl} width="16" height="16" alt="" />;
  if (editor.icon === "cursor") return <BrandIcon name="cursor" />;
  if (editor.icon === "antigravity") return <BrandIcon name="antigravity" color />;
  if (editor.icon === "windsurf") return <BrandIcon name="windsurf" />;
  if (editor.icon === "explorer") return <FolderOpenIcon aria-hidden />;
  return <CodeIcon aria-hidden />;
}
