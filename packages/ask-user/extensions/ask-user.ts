import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import {
  Container,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  SelectList,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";
import type { SelectItem } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  askUserProtocol,
  type AskUserAnswer,
  type AskUserDetails,
  type AskUserOption,
  type AskUserResponse,
} from "../types.ts";

const CUSTOM_VALUE = "__custom__";

const optionSchema = Type.Object({
  label: Type.String({ description: "A concise answer shown to the user" }),
  description: Type.Optional(Type.String({ description: "A short explanation of the answer's tradeoffs" })),
  recommended: Type.Boolean({
    description: "Whether this answer is recommended. At least one answer in options must be recommended.",
  }),
});

const parameters = Type.Object({
  question: Type.String({ description: "The focused question the user needs to decide" }),
  options: Type.Array(optionSchema, {
    description: "Distinct answers. Include at least two and mark at least one as recommended.",
    minItems: 2,
  }),
});

export function validateOptions(options: readonly AskUserOption[]) {
  if (options.length < 2) throw new Error("ask_user requires at least two answers.");
  if (!options.some((option) => option.recommended)) {
    throw new Error("ask_user requires at least one recommended answer.");
  }
}

function optionAnswer(options: readonly AskUserOption[], index: number): AskUserAnswer {
  const option = options[index];
  if (!option) throw new Error("ask_user received an unknown answer.");
  return { type: "option", ...option, index: index + 1 };
}

function answerText(answer: AskUserAnswer) {
  if (answer.type === "custom") return `User wrote: ${answer.text}`;
  return `User selected ${answer.index}. ${answer.label}${answer.recommended ? " (recommended)" : ""}.`;
}

function details(question: string, options: AskUserOption[], answer: AskUserAnswer | null): AskUserDetails {
  return { question, options, answer, cancelled: answer === null };
}

function waitForNativeResponse(
  toolCallId: string,
  signal: AbortSignal | undefined,
  pending: Map<string, (response: AskUserResponse) => void>,
) {
  return new Promise<AskUserResponse>((resolve, reject) => {
    const abort = () => {
      pending.delete(toolCallId);
      reject(new Error("ask_user was cancelled."));
    };
    pending.set(toolCallId, (response) => {
      signal?.removeEventListener("abort", abort);
      pending.delete(toolCallId);
      resolve(response);
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function askInTui(
  context: ExtensionContext,
  question: string,
  options: AskUserOption[],
): Promise<AskUserAnswer | null> {
  return context.ui.custom<AskUserAnswer | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const items: SelectItem[] = [
      ...options.map((option, index) => ({
        value: String(index),
        label: `${option.label}${option.recommended ? "  ★ Recommended" : ""}`,
        description: option.description,
      })),
      {
        value: CUSTOM_VALUE,
        label: "Write your own answer",
        description: "Add context or describe another direction without leaving this question.",
      },
    ];
    const list = new SelectList(items, Math.min(items.length, 8), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    }, { minPrimaryColumnWidth: 20, maxPrimaryColumnWidth: 52 });
    const editorTheme: EditorTheme = {
      borderColor: (text) => theme.fg("accent", text),
      selectList: {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      },
    };
    const editor = new Editor(tui, editorTheme);
    let writing = false;

    const rebuild = () => {
      container.clear();
      container.addChild(new DynamicBorder((line) => theme.fg("border", line)));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("accent", theme.bold("Question")), 1, 0));
      container.addChild(new Text(theme.fg("text", question), 1, 0));
      container.addChild(new Spacer(1));
      if (writing) {
        container.addChild(new Text(theme.fg("muted", "Write your own answer"), 1, 0));
        container.addChild(editor);
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", "Enter submit  ·  Esc return to choices"), 1, 0));
      } else {
        container.addChild(list);
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", "↑↓ navigate  ·  Enter choose  ·  Esc cancel"), 1, 0));
      }
      container.addChild(new Spacer(1));
      container.addChild(new DynamicBorder((line) => theme.fg("border", line)));
      tui.requestRender();
    };

    list.onSelect = (item) => {
      if (item.value === CUSTOM_VALUE) {
        writing = true;
        editor.setText("");
        rebuild();
        return;
      }
      done(optionAnswer(options, Number(item.value)));
    };
    list.onCancel = () => done(null);
    editor.onSubmit = (value) => {
      const text = value.trim();
      if (text) done({ type: "custom", text });
    };
    rebuild();

    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        if (writing && matchesKey(data, Key.escape)) {
          writing = false;
          rebuild();
          return;
        }
        if (writing) editor.handleInput(data);
        else list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

async function askWithBasicUi(
  context: ExtensionContext,
  question: string,
  options: AskUserOption[],
  signal: AbortSignal | undefined,
) {
  const labels = [
    ...options.map((option, index) => `${index + 1}. ${option.label}${option.recommended ? " (Recommended)" : ""}`),
    "Write your own answer",
  ];
  const selected = await context.ui.select(question, labels, { signal });
  if (selected === undefined) return null;
  const index = labels.indexOf(selected);
  if (index < options.length) return optionAnswer(options, index);
  const text = await context.ui.input("Write your own answer", "Your answer", { signal });
  return text?.trim() ? { type: "custom" as const, text: text.trim() } : null;
}

export default function askUserExtension(pi: ExtensionAPI) {
  const pending = new Map<string, (response: AskUserResponse) => void>();
  const ui = connect("@nativepi/ask-user", askUserProtocol, {
    answer: ({ toolCallId, response }) => {
      const resolve = pending.get(toolCallId);
      if (!resolve) throw new Error("This question is no longer waiting for an answer.");
      resolve(response);
      return { accepted: true };
    },
  });

  pi.on("session_shutdown", () => {
    for (const resolve of pending.values()) resolve({ type: "cancel" });
    pending.clear();
  });

  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user one focused multiple-choice question when an important requirement, preference, or tradeoff cannot be determined safely. The user can choose an option or write a custom answer. Every question must have at least two options and at least one recommended option.",
    promptSnippet: "Ask a focused multiple-choice question instead of guessing when a consequential decision is unclear",
    promptGuidelines: [
      "Use ask_user when missing information would materially change the result; do not silently assume an answer.",
      "Before using ask_user, complete any unblocked discovery that could answer the question, and ask only for a decision the user must make.",
      "Every ask_user call must mark at least one answer as recommended while leaving the final choice to the user.",
    ],
    parameters,
    executionMode: "sequential",

    async execute(toolCallId, params, signal, _onUpdate, context) {
      validateOptions(params.options);
      if (!context.hasUI) throw new Error("ask_user requires an interactive Pi or NativePi session.");

      let answer: AskUserAnswer | null;
      if (ui.connected) {
        const response = await waitForNativeResponse(toolCallId, signal, pending);
        if (response.type === "cancel") answer = null;
        else if (response.type === "custom") answer = { type: "custom", text: response.text };
        else answer = optionAnswer(params.options, response.index);
      } else if (context.mode === "tui") {
        answer = await askInTui(context, params.question, params.options);
      } else {
        answer = await askWithBasicUi(context, params.question, params.options, signal);
      }

      if (!answer) {
        return {
          content: [{ type: "text" as const, text: "User cancelled the question without answering." }],
          details: details(params.question, params.options, null),
        };
      }
      return {
        content: [{ type: "text" as const, text: answerText(answer) }],
        details: details(params.question, params.options, answer),
      };
    },

    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("Ask User ")) + theme.fg("muted", args.question),
        0,
        0,
      );
    },

    renderResult(result, _options, theme, context) {
      const value = result.details as AskUserDetails | undefined;
      if (!value) {
        const content = result.content.find((item) => item.type === "text");
        return new Text(theme.fg(context.isError ? "error" : "muted", content?.text ?? ""), 0, 0);
      }
      if (value.cancelled || !value.answer) return new Text(theme.fg("warning", "Question cancelled"), 0, 0);
      const text = value.answer.type === "custom"
        ? `${theme.fg("muted", "Wrote ")}${theme.fg("accent", value.answer.text)}`
        : `${theme.fg("accent", `${value.answer.index}. ${value.answer.label}`)}${value.answer.recommended ? theme.fg("muted", "  ★ recommended") : ""}`;
      return new Text(theme.fg("success", "✓ ") + text, 0, 0);
    },
  });
}
