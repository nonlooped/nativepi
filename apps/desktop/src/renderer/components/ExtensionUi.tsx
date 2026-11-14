import { useId, useState } from "react";
import type { ExtensionPrompt } from "../lib/store.ts";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";

export default function ExtensionUi() {
  const prompt = useAppStore((s) => s.extPrompts[0]);
  // Notifications are not rendered here: they go straight to the toast layer,
  // which owns stacking and dismissal for every transient message in the app.
  return prompt ? <ExtensionPromptDialog key={prompt.id} prompt={prompt} /> : null;
}

const PROMPT_DESCRIPTIONS: Record<ExtensionPrompt["method"], string> = {
  select: "Choose an option to continue.",
  confirm: "Confirm to continue.",
  input: "Enter an answer to continue.",
  editor: "Edit this text to continue.",
};

function ExtensionPromptDialog({ prompt }: { prompt: ExtensionPrompt }) {
  const respond = useAppStore((s) => s.respondExtension);
  const [value, setValue] = useState(prompt.method === "editor" ? (prompt.prefill ?? "") : "");
  const fieldId = useId();
  const formId = useId();

  const cancel = () => respond({ cancel: true });
  // These dialogs come from third-party code: without a description, the user is asked to answer a question with
  // no statement of who is asking or what answering does.
  const description =
    (prompt.method === "confirm" ? prompt.message : undefined) ?? PROMPT_DESCRIPTIONS[prompt.method];

  return (
    <Dialog open onOpenChange={(next) => !next && cancel()}>
      <DialogContent className={prompt.method === "editor" ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {prompt.method === "select" ? (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {prompt.options.map((option, i) => (
              <Button key={i} variant="ghost" className="h-auto min-h-10 shrink-0 justify-start whitespace-normal py-2 text-left text-foreground" onClick={() => respond({ value: option })}>
                {option}
              </Button>
            ))}
          </div>
        ) : null}

        {prompt.method === "input" ? (
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              respond({ value });
            }}
          >
            {/* The placeholder is `prompt.placeholder ?? ""`, so it cannot be
                relied on for the accessible name — the extension may not set it. */}
            <Field>
              <FieldLabel htmlFor={fieldId} className="sr-only">{prompt.title}</FieldLabel>
              <Input id={fieldId} autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={prompt.placeholder ?? ""} />
            </Field>
          </form>
        ) : null}

        {prompt.method === "editor" ? (
          <div className="flex flex-col gap-2">
            <Field>
              <FieldLabel htmlFor={fieldId} className="sr-only">{prompt.title}</FieldLabel>
              <Textarea id={fieldId} autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={8} className="min-h-48 max-h-96 overflow-y-auto font-mono text-sm" />
              <FieldDescription className="sr-only">Enter a response for the extension.</FieldDescription>
            </Field>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          {prompt.method === "input" ? <Button type="submit" form={formId}>Submit</Button> : null}
          {prompt.method === "editor" ? <Button onClick={() => respond({ value })}>Submit</Button> : null}
          {prompt.method === "confirm" ? <Button onClick={() => respond({ confirmed: true })}>Confirm</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
