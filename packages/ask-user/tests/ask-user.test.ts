import { afterEach, expect, test } from "bun:test";
import askUserExtension, { validateOptions } from "../extensions/ask-user.ts";
import type { AskUserDetails, AskUserOption } from "../types.ts";

const OPTIONS: AskUserOption[] = [
  { label: "Use the package", description: "Less maintenance", recommended: true },
  { label: "Build it ourselves", recommended: false },
];

afterEach(() => {
  globalThis.__NATIVEPI_EXTENSION_HOST__ = undefined;
});

test("requires multiple answers with at least one recommendation", () => {
  expect(() => validateOptions([OPTIONS[0]])).toThrow("at least two answers");
  expect(() => validateOptions(OPTIONS.map((option) => ({ ...option, recommended: false })))).toThrow(
    "at least one recommended answer",
  );
  expect(() => validateOptions(OPTIONS)).not.toThrow();
});

test("registers prompt guidance and a sequential tool", () => {
  let registered: { name: string; executionMode?: string; promptGuidelines?: string[] } | undefined;
  const pi = {
    on: () => undefined,
    registerTool: (tool: typeof registered) => {
      registered = tool;
    },
  } as unknown as Parameters<typeof askUserExtension>[0];

  askUserExtension(pi);

  expect(registered?.name).toBe("ask_user");
  expect(registered?.executionMode).toBe("sequential");
  expect(registered?.promptGuidelines?.join(" ")).toContain("do not silently assume");
});

test("NativePi renderer can return a selected option", async () => {
  let registeredMethods: Readonly<Record<string, (params: unknown) => Promise<unknown>>> = {};
  globalThis.__NATIVEPI_EXTENSION_HOST__ = {
    register: (_extension, methods) => {
      registeredMethods = methods as typeof registeredMethods;
    },
    emit: () => undefined,
  };

  type Execute = (
    id: string,
    params: { question: string; options: AskUserOption[] },
    signal: AbortSignal,
    onUpdate: undefined,
    context: { hasUI: boolean; mode: "rpc" },
  ) => Promise<{ content: Array<{ text: string }>; details: AskUserDetails }>;
  let execute: Execute | undefined;
  const pi = {
    on: () => undefined,
    registerTool: (tool: { execute: Execute }) => {
      execute = tool.execute;
    },
  } as unknown as Parameters<typeof askUserExtension>[0];
  askUserExtension(pi);

  const resultPromise = execute!(
    "call-1",
    { question: "Which approach?", options: OPTIONS },
    new AbortController().signal,
    undefined,
    { hasUI: true, mode: "rpc" },
  );
  await registeredMethods["answer"]!({
    toolCallId: "call-1",
    response: { type: "option", index: 0 },
  });
  const result = await resultPromise;

  expect(result.details.answer).toEqual({ type: "option", ...OPTIONS[0], index: 1 });
  expect(result.content[0]?.text).toContain("Use the package (recommended)");
});

test("NativePi renderer can return a written answer", async () => {
  let registeredMethods: Readonly<Record<string, (params: unknown) => Promise<unknown>>> = {};
  globalThis.__NATIVEPI_EXTENSION_HOST__ = {
    register: (_extension, methods) => {
      registeredMethods = methods as typeof registeredMethods;
    },
    emit: () => undefined,
  };

  type Execute = (
    id: string,
    params: { question: string; options: AskUserOption[] },
    signal: AbortSignal,
    onUpdate: undefined,
    context: { hasUI: boolean; mode: "rpc" },
  ) => Promise<{ details: AskUserDetails }>;
  let execute: Execute | undefined;
  const pi = {
    on: () => undefined,
    registerTool: (tool: { execute: Execute }) => {
      execute = tool.execute;
    },
  } as unknown as Parameters<typeof askUserExtension>[0];
  askUserExtension(pi);

  const resultPromise = execute!(
    "call-2",
    { question: "Which approach?", options: OPTIONS },
    new AbortController().signal,
    undefined,
    { hasUI: true, mode: "rpc" },
  );
  await registeredMethods["answer"]!({
    toolCallId: "call-2",
    response: { type: "custom", text: "Keep the current implementation." },
  });

  expect((await resultPromise).details.answer).toEqual({
    type: "custom",
    text: "Keep the current implementation.",
  });
});
