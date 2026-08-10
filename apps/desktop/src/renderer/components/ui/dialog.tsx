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
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          // `max-w-md` alone leaves a dialog flush against both edges of any
          // screen narrower than 28rem, and its rounded corners with it. It also
          // caps its height: a confirm dialog on a phone in landscape is taller
          // than the viewport.
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-popover p-5 text-popover-foreground shadow-lg outline-none transition-[opacity,scale] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
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
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex items-center justify-end gap-2", className)}>{children}</div>;
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
