import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";

const ContextMenu = BaseContextMenu.Root;

function ContextMenuTrigger({ className, ...props }: BaseContextMenu.Trigger.Props) {
  return <BaseContextMenu.Trigger className={className} {...props} />;
}

function ContextMenuContent({ className, ...props }: BaseContextMenu.Popup.Props) {
  return (
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner className="isolate z-50 outline-none">
        <BaseContextMenu.Popup
          className={cn(
            "max-h-(--available-height) min-w-44 max-w-[calc(100vw-1rem)] origin-(--transform-origin) overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  );
}

function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: BaseContextMenu.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <BaseContextMenu.Item
      data-variant={variant}
      className={cn(
        "flex min-h-7 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive/10 data-[variant=destructive]:data-[highlighted]:text-destructive data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({ className, ...props }: BaseContextMenu.Separator.Props) {
  return <BaseContextMenu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator };
