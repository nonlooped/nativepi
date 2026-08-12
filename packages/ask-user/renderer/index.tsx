import { useId, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext, ToolResult } from "@nativepi/extension-api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Textarea,
} from "@nativepi/extension-api/ui";
import {
  askUserDetailsSchema,
  askUserProtocol,
  askUserQuestionSchema,
  type AskUserDetails,
  type AskUserQuestion,
  type AskUserResponse,
} from "../types.ts";

type Context = RendererContext<typeof askUserProtocol>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function submitResponse(
  context: Context,
  toolCallId: string,
  response: AskUserResponse,
  setSubmitting: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  setSubmitting(true);
  setError(null);
  void context.channel.call("answer", { toolCallId, response })
    .catch((error: unknown) => {
      setSubmitting(false);
      setError(errorMessage(error));
    });
}

function QuestionDialog({ callId, question, context }: {
  callId: string;
  question: AskUserQuestion;
  context: Context;
}) {
  const fieldId = useId();
  const [customAnswer, setCustomAnswer] = useState("");
  const [writing, setWriting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const respond = (response: AskUserResponse) => {
    if (!submitting) submitResponse(context, callId, response, setSubmitting, setError);
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.625rem",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
          background: "var(--card)",
          color: "var(--muted-foreground)",
          fontSize: "0.75rem",
        }}
      >
        <span style={{ width: 6, height: 6, flex: "0 0 auto", borderRadius: 999, background: "currentColor" }} />
        Waiting for an answer
      </div>
      <Dialog open onOpenChange={(open) => !open && respond({ type: "cancel" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{question.question}</DialogTitle>
            <DialogDescription>Select an answer or write your own.</DialogDescription>
          </DialogHeader>

          {writing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = customAnswer.trim();
                if (text) respond({ type: "custom", text });
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor={fieldId}>Your answer</FieldLabel>
                <Textarea
                  autoFocus
                  id={fieldId}
                  value={customAnswer}
                  disabled={submitting}
                  aria-invalid={!!error || undefined}
                  placeholder="For example: keep the first option, but change…"
                  rows={3}
                  onChange={(event) => setCustomAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <FieldDescription>Press Ctrl+Enter or ⌘+Enter to submit.</FieldDescription>
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => {
                    setError(null);
                    setWriting(false);
                  }}
                >
                  Back
                </Button>
                <Button type="submit" disabled={submitting || !customAnswer.trim()}>
                  Submit answer
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <div
                role="group"
                aria-label="Answers"
                style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
              >
                {question.options.map((option, index) => (
                  <Button
                    key={`${index}:${option.label}`}
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => respond({ type: "option", index })}
                    style={{
                      width: "100%",
                      height: "auto",
                      minHeight: "2.75rem",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      gap: "0.625rem",
                      padding: "0.5rem 0.625rem",
                      whiteSpace: "normal",
                      textAlign: "start",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "1rem",
                        flex: "0 0 auto",
                        color: "var(--muted-foreground)",
                        fontSize: "0.6875rem",
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.7,
                        textAlign: "center",
                      }}
                    >
                      {index + 1}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.375rem" }}
                      >
                        <span style={{ color: "var(--foreground)", fontSize: "0.8125rem", fontWeight: 600 }}>
                          {option.label}
                        </span>
                        {option.recommended ? <Badge variant="secondary">Recommended</Badge> : null}
                      </span>
                      {option.description ? (
                        <span
                          style={{
                            display: "block",
                            marginTop: "0.125rem",
                            color: "var(--muted-foreground)",
                            fontSize: "0.75rem",
                            lineHeight: 1.4,
                          }}
                        >
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => {
                    setError(null);
                    setWriting(true);
                  }}
                  style={{
                    width: "100%",
                    height: "auto",
                    minHeight: "2.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "0.5rem 0.625rem",
                  }}
                >
                  <PencilSimpleIcon data-icon="inline-start" />
                  Write a different answer
                </Button>
              </div>
              {error ? <FieldError>{error}</FieldError> : null}
              <DialogFooter>
                <Button type="button" variant="ghost" disabled={submitting} onClick={() => respond({ type: "cancel" })}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnsweredQuestion({ details, result }: { details: AskUserDetails | null; result: ToolResult }) {
  if (result.isError) return <FieldError>{result.text || "Unable to ask this question."}</FieldError>;
  if (!details || details.cancelled || !details.answer) {
    return <div style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>Question cancelled</div>;
  }

  const answer = details.answer;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.625rem",
        padding: "0.625rem 0.75rem",
        border: "1px solid var(--border)",
        borderRadius: "0.625rem",
        background: "var(--card)",
      }}
    >
      <CheckCircleIcon size={18} weight="fill" aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 1, color: "var(--success)" }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: "var(--muted-foreground)", fontSize: "0.6875rem" }}>{details.question}</span>
        <span style={{ display: "block", marginTop: "0.125rem", color: "var(--foreground)", fontSize: "0.8125rem", lineHeight: 1.45 }}>
          {answer.type === "custom" ? answer.text : answer.label}
        </span>
      </span>
    </div>
  );
}

function AskUserTool({ call, result, context }: {
  call: { id: string; arguments: Record<string, unknown> };
  result?: ToolResult;
  context: Context;
}) {
  if (result) {
    const parsed = askUserDetailsSchema.safeParse(result.details);
    return <AnsweredQuestion details={parsed.success ? parsed.data : null} result={result} />;
  }

  const parsed = askUserQuestionSchema.safeParse(call.arguments);
  if (!parsed.success) return <FieldError>Unable to display this question because its options are invalid.</FieldError>;
  return <QuestionDialog callId={call.id} question={parsed.data} context={context} />;
}

export default defineRenderer({
  apiVersion: 1,
  protocol: askUserProtocol,
  tools: {
    ask_user: ({ call, result, context }) => <AskUserTool call={call} result={result} context={context} />,
  },
});
