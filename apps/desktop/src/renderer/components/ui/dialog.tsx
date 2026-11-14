import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "@/components/ui/button";
import { useDialogStyles } from "./dialog-styles.ts";
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
  layout = "form",
}: {
  className?: string;
  children?: React.ReactNode;
  /** Pickers and viewers own their header and scrollable body padding. */
  layout?: "form" | "picker" | "viewer";
  showCloseButton?: boolean;
  /** Repositions the close button for dialogs whose first row is a search field. */
  closeClassName?: string;
}) {
  const styles = useDialogStyles();
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={styles.overlay} />
      <BaseDialog.Popup
        className={cn(
          // `max-w-md` alone leaves a dialog flush against both edges of any
          // screen narrower than 28rem, and its rounded corners with it. It also
          // caps its height: a confirm dialog on a phone in landscape is taller
          // than the viewport.
          styles.surface,
          layout !== "form" && "gap-0 overflow-hidden p-0 sm:p-0",
          layout === "viewer" && "max-w-5xl",
          showCloseButton && "[&>h2]:pr-8 [&>div:first-child>h2]:pr-8",
          className,
        )}
      >
        {children}
        {showCloseButton ? (
          <BaseDialog.Close
            render={<Button variant="ghost" size="icon-sm" className={cn(styles.close, layout === "viewer" && "top-4 right-4", closeClassName)} />}
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
  const styles = useDialogStyles();
  return <div className={cn(styles.header, className)}>{children}</div>;
}

function DialogFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  const styles = useDialogStyles();
  return (
    <div className={cn(styles.footer, className)}>
      {children}
    </div>
  );
}

function DialogViewerContent({ title, description, className, children }: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogContent layout="viewer" className={className}>
      <DialogHeader className="border-b border-border/40 px-6 py-4">
        <DialogTitle className="truncate" title={title}>{title}</DialogTitle>
        {description ? <DialogDescription className="sr-only">{description}</DialogDescription> : null}
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
    </DialogContent>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogViewerContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
