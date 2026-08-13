import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;
const DialogTitle = BaseDialog.Title;
const DialogDescription = BaseDialog.Description;

function DialogContent({
  className,
  children,
  showCloseButton = true,
}: {
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/70 transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          // `max-w-md` alone leaves a dialog flush against both edges of any
          // screen narrower than 28rem, and its rounded corners with it. It also
          // caps its height: a confirm dialog on a phone in landscape is taller
          // than the viewport.
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(var(--app-height,100dvh)-2rem)] w-[calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border bg-popover p-5 text-popover-foreground shadow-lg outline-none transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0",
          className,
        )}
      >
        {children}
        {showCloseButton ? (
          <BaseDialog.Close
            render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" />}
          >
            <XIcon />
            <span className="sr-only">Close dialog</span>
          </BaseDialog.Close>
        ) : null}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex shrink-0 flex-col gap-1", className)}>{children}</div>;
}

function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end", className)}>
      {children}
    </div>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
