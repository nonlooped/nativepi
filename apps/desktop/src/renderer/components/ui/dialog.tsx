import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;
function DialogTitle({ className, ...props }: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={typeof className === "function"
        ? (state) => cn("text-title text-pretty", className(state))
        : cn("text-title text-pretty", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={typeof className === "function"
        ? (state) => cn("text-sm leading-relaxed text-body-muted-foreground", className(state))
        : cn("text-sm leading-relaxed text-body-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeClassName,
}: {
  className?: string;
  children?: React.ReactNode;
  showCloseButton?: boolean;
  /** Repositions the close button for dialogs whose first row is a search field. */
  closeClassName?: string;
}) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-overlay transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          // `max-w-md` alone leaves a dialog flush against both edges of any
          // screen narrower than 28rem, and its rounded corners with it. It also
          // caps its height: a confirm dialog on a phone in landscape is taller
          // than the viewport.
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(var(--app-height,100dvh)-2rem)] w-[calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border/70 bg-popover p-5 sm:p-6 text-popover-foreground shadow-xl outline-none transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0",
          showCloseButton && "[&>h2]:pr-8 [&>div:first-child>h2]:pr-8",
          className,
        )}
      >
        {children}
        {showCloseButton ? (
          <BaseDialog.Close
            render={<Button variant="ghost" size="icon-sm" className={cn("absolute top-4 right-4", closeClassName)} />}
          >
            <XIcon />
            <span className="sr-only">Close dialog</span>
          </BaseDialog.Close>
        ) : null}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("flex shrink-0 flex-col gap-2", className)}>{children}</div>;
}

function DialogFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:border-t sm:border-border/60 sm:pt-5", className)}>
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
