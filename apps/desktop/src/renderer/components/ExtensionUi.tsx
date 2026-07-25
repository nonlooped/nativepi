import { useEffect, useId, useState } from "react";
import type { ExtensionPrompt } from "../lib/store.ts";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

export default function ExtensionUi() {
  const prompt = useAppStore((s) => s.extPrompts[0]);
  // Notifications are not rendered here: they go straight to the toast layer,
  // which owns stacking and dismissal for every transient message in the app.
  return prompt ? <ExtensionPromptDialog prompt={prompt} /> : null;
}

const PROMPT_DESCRIPTIONS: Record<ExtensionPrompt["method"], string> = {
  select: "An extension is asking you to choose one of these options before it continues.",
  confirm: "An extension is asking you to confirm before it continues.",
  input: "An extension is asking for a value before it continues.",
  editor: "An extension is asking you to edit this text before it continues.",
};

function ExtensionPromptDialog({ prompt }: { prompt: ExtensionPrompt }) {
  const respond = useAppStore((s) => s.respondExtension);
  const [value, setValue] = useState(prompt.method === "editor" ? (prompt.prefill ?? "") : "");
  const fieldId = useId();

  useEffect(() => setValue(prompt.method === "editor" ? (prompt.prefill ?? "") : ""), [prompt.id]);

  const cancel = () => respond({ cancel: true });
  // DESIGN.md makes descriptions mandatory, and these dialogs come from
  // third-party code: without one, the user is asked to answer a question with
  // no statement of who is asking or what answering does.
  const description =
    (prompt.method === "confirm" ? prompt.message : undefined) ?? PROMPT_DESCRIPTIONS[prompt.method];

  return (
    <Dialog open onOpenChange={(next) => !next && cancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">{prompt.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {prompt.method === "select" ? (
          <div className="flex flex-col gap-1">
            {prompt.options.map((option, i) => (
              <Button key={i} variant="outline" className="justify-start" onClick={() => respond({ value: option })}>
                {option}
              </Button>
            ))}
          </div>
        ) : null}

        {prompt.method === "input" ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              respond({ value });
            }}
          >
            {/* The placeholder is `prompt.placeholder ?? ""`, so it cannot be
                relied on for the accessible name — the extension may not set it. */}
            <Label htmlFor={fieldId} className="sr-only">
              {prompt.title}
            </Label>
            <Input
              id={fieldId}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={prompt.placeholder ?? ""}
            />
            <Button type="submit">Submit</Button>
          </form>
        ) : null}

        {prompt.method === "editor" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId} className="sr-only">
              {prompt.title}
            </Label>
            <Textarea
              id={fieldId}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={8}
              className="resize-none font-mono text-sm"
            />
            <div className="flex justify-end">
              <Button onClick={() => respond({ value })}>Submit</Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
          {prompt.method === "confirm" ? <Button onClick={() => respond({ confirmed: true })}>Confirm</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
