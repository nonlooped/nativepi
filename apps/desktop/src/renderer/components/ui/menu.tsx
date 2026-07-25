import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

const Menu = BaseMenu.Root;
const MenuTrigger = BaseMenu.Trigger;

function MenuPopup({
  className,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  children,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  children: React.ReactNode;
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner side={side} sideOffset={sideOffset} align={align} className="z-50">
        <BaseMenu.Popup
          className={cn(
            "max-h-80 min-w-44 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            className,
          )}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

function MenuItem({
  className,
  ...props
}: BaseMenu.Item.Props) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Menu, MenuTrigger, MenuPopup, MenuItem };
