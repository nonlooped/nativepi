import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@earendil-works/pi-coding-agent";
import { z } from "@nativepi/extension-api/schema";
import type { SubagentConversationBlock, SubagentConversationMessage, SubagentStatus } from "../types.ts";

const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cacheWrite1h: z.number().optional(),
  reasoning: z.number().optional(),
  totalTokens: z.number(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    total: z.number(),
  }).passthrough(),
}).passthrough();
const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.array(z.unknown()),
  provider: z.string(),
  model: z.string(),
  usage: usageSchema,
  stopReason: z.string(),
  errorMessage: z.string().optional(),
}).passthrough();
const eventSchema = z.object({
  type: z.string(),
  message: z.unknown().optional(),
  assistantMessageEvent: z.unknown().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  isError: z.boolean().optional(),
  aborted: z.boolean().optional(),
}).passthrough();

type Usage = z.infer<typeof usageSchema>;
export function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function addUsage(target: Usage, value: Usage) {
  target.input += value.input;
  target.output += value.output;
  target.cacheRead += value.cacheRead;
  target.cacheWrite += value.cacheWrite;
  target.totalTokens += value.totalTokens;
  target.cost.input += value.cost.input;
  target.cost.output += value.cost.output;
  target.cost.cacheRead += value.cost.cacheRead;
  target.cost.cacheWrite += value.cost.cacheWrite;
  target.cost.total += value.cost.total;
  if (value.cacheWrite1h !== undefined) target.cacheWrite1h = (target.cacheWrite1h ?? 0) + value.cacheWrite1h;
  if (value.reasoning !== undefined) target.reasoning = (target.reasoning ?? 0) + value.reasoning;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assistantText(content: unknown[]) {
  return content.flatMap((part) =>
    isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [],
  ).join("");
}

function boundedText(text: string, max = DEFAULT_MAX_BYTES) {
  return truncateHead(text, { maxBytes: max, maxLines: DEFAULT_MAX_LINES }).content;
}

function jsonText(value: unknown, max = 8_000) {
  try {
    const text = JSON.stringify(value, null, 2);
    return text ? boundedText(text, max) : undefined;
  } catch {
    return undefined;
  }
}

function toolResultText(value: unknown) {
  if (!isRecord(value)) return jsonText(value);
  const content = value["content"];
  if (Array.isArray(content)) {
    const text = content.flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    ).join("\n");
    if (text) return boundedText(text);
  }
  return jsonText(value, DEFAULT_MAX_BYTES);
}

export function conversationBlocks(content: unknown[]) {
  return content.flatMap((part): SubagentConversationBlock[] => {
    if (!isRecord(part) || typeof part.type !== "string") return [];
    if (part.type === "text" && typeof part.text === "string") {
      return [{ type: "text", text: boundedText(part.text) }];
    }
    if (part.type === "thinking" && typeof part.thinking === "string") {
      return [{ type: "thinking", text: boundedText(part.thinking) }];
    }
    if (part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") {
      const args = jsonText(part.arguments);
      return [{
        type: "tool",
        id: part.id,
        name: part.name,
        status: "running",
        ...(args ? { arguments: args } : {}),
      }];
    }
    return [];
  });
}

function findTool(job: Projection, id: string) {
  for (let messageIndex = job.conversation.length - 1; messageIndex >= 0; messageIndex--) {
    const message = job.conversation[messageIndex]!;
    const blockIndex = message.content.findIndex((block) => block.type === "tool" && block.id === id);
    if (blockIndex >= 0) return { message, blockIndex };
  }
  return undefined;
}

function streamingMessage(job: Projection) {
  const existing = job.streamingMessageId
    ? job.conversation.find((message) => message.id === job.streamingMessageId)
    : undefined;
  if (existing) return existing;
  const message: SubagentConversationMessage = {
    id: `${job.id}-assistant-${++job.messageSequence}`,
    role: "assistant",
    content: [],
    timestamp: Date.now(),
  };
  job.streamingMessageId = message.id;
  job.conversation.push(message);
  return message;
}

function setStreamingBlock(message: SubagentConversationMessage, index: number, block: SubagentConversationBlock) {
  while (message.content.length < index) message.content.push({ type: "text", text: "" });
  message.content[index] = block;
}

function applyConversationEvent(job: Projection, data: z.infer<typeof eventSchema>) {
  if (data.type === "message_update" && isRecord(data.assistantMessageEvent)) {
    const update = data.assistantMessageEvent;
    const type = update["type"];
    const index = update["contentIndex"];
    if (typeof type !== "string" || typeof index !== "number" || !Number.isInteger(index) || index < 0) return false;
    const message = streamingMessage(job);
    const current = message.content[index];
    if (type === "text_start") setStreamingBlock(message, index, { type: "text", text: "" });
    else if (type === "text_delta" && typeof update["delta"] === "string") {
      setStreamingBlock(message, index, {
        type: "text",
        text: boundedText(`${current?.type === "text" ? current.text : ""}${update["delta"]}`),
      });
    } else if (type === "text_end" && typeof update["content"] === "string") {
      setStreamingBlock(message, index, { type: "text", text: boundedText(update["content"]) });
    } else if (type === "thinking_start") setStreamingBlock(message, index, { type: "thinking", text: "" });
    else if (type === "thinking_delta" && typeof update["delta"] === "string") {
      setStreamingBlock(message, index, {
        type: "thinking",
        text: boundedText(`${current?.type === "thinking" ? current.text : ""}${update["delta"]}`),
      });
    } else if (type === "thinking_end" && typeof update["content"] === "string") {
      setStreamingBlock(message, index, { type: "thinking", text: boundedText(update["content"]) });
    } else if (type === "toolcall_end" && isRecord(update["toolCall"])) {
      const tool = update["toolCall"];
      if (typeof tool.id !== "string" || typeof tool.name !== "string") return false;

      const args = jsonText(tool.arguments);
      setStreamingBlock(message, index, {
        type: "tool",
        id: tool.id,
        name: tool.name,
        status: "running",
        ...(args ? { arguments: args } : {}),
      });
    } else return false;
    return true;
  }
  if (data.type === "message_end") {
    const message = assistantMessageSchema.safeParse(data.message);
    if (!message.success) return false;
    const content = conversationBlocks(message.data.content);
    if (content.length === 0 && !message.data.errorMessage) return false;

    const current = job.streamingMessageId
      ? job.conversation.find((candidate) => candidate.id === job.streamingMessageId)
      : undefined;
    const completed = {
      id: current?.id ?? `${job.id}-assistant-${++job.messageSequence}`,
      role: "assistant" as const,
      content,
      timestamp: Date.now(),
      ...(message.data.errorMessage ? { error: message.data.errorMessage } : {}),
    };
    if (current) job.conversation[job.conversation.indexOf(current)] = completed;
    else job.conversation.push(completed);
    job.streamingMessageId = undefined;
    return true;
  }
  if (data.type !== "tool_execution_start" && data.type !== "tool_execution_end") return false;
  if (!data.toolCallId || !data.toolName) return false;
  const found = findTool(job, data.toolCallId);
  const args = jsonText(data.args);
  const result = data.type === "tool_execution_end" ? toolResultText(data.result) : undefined;
  const next: SubagentConversationBlock = {
    type: "tool",
    id: data.toolCallId,
    name: data.toolName,
    status: data.type === "tool_execution_start" ? "running" : data.isError ? "failed" : "completed",
    ...(args ? { arguments: args } : {}),
    ...(result ? { result } : {}),
  };
  if (found) {
    const previous = found.message.content[found.blockIndex];
    found.message.content[found.blockIndex] = {
      ...previous,
      ...next,
      ...(previous?.type === "tool" && previous.arguments && !next.arguments
        ? { arguments: previous.arguments }
        : {}),
    };
  } else {
    job.conversation.push({
      id: `${job.id}-assistant-${++job.messageSequence}`,
      role: "assistant",
      content: [next],
      timestamp: Date.now(),
    });
  }
  return true;
}

function settleConversation(job: Projection, status: SubagentStatus) {
  for (const message of job.conversation) {
    message.content = message.content.map((block) =>
      block.type === "tool" && block.status === "running"
        ? {
            ...block,
            status: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
            ...(status === "cancelled" ? { result: block.result ?? "Cancelled." } : {}),
          }
        : block,
    );
  }
}

type Projection = {
  id: string;
  conversation: SubagentConversationMessage[];
  messageSequence: number;
  streamingMessageId?: string;
};

export function createSubagentProjection(id: string, prompt?: string) {
  const view: Projection = {
    id, messageSequence: 1,
    conversation: prompt === undefined ? [] : [{ id: `${id}-user-1`, role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
  };
  const usage = emptyUsage();
  const tools = new Set<string>();
  let output = "";
  let stopReason: string | undefined;
  let error: string | undefined;
  let model: string | undefined;
  let turns = 0;
  let aborted = false;
  return {
    accept(line: string) {
      let raw: unknown;
      try { raw = JSON.parse(line); } catch { return false; }
      const parsed = eventSchema.safeParse(raw);
      if (!parsed.success) return false;
      const event = parsed.data;
      if (event.type === "agent_settled") aborted = event.aborted ?? false;
      if ((event.type === "tool_execution_start" || event.type === "tool_execution_end") && event.toolCallId) tools.add(event.toolCallId);
      if (event.type === "message_update" && isRecord(event.assistantMessageEvent)) {
        const tool = event.assistantMessageEvent.toolCall;
        if (event.assistantMessageEvent.type === "toolcall_end" && isRecord(tool) && typeof tool.id === "string") tools.add(tool.id);
      }
      if (event.type === "message_end") {
        const message = assistantMessageSchema.safeParse(event.message);
        if (message.success) {
          output = assistantText(message.data.content);
          stopReason = message.data.stopReason;
          error = message.data.errorMessage;
          model = `${message.data.provider}/${message.data.model}`;
          turns += 1;
          addUsage(usage, message.data.usage);
          for (const block of conversationBlocks(message.data.content)) if (block.type === "tool") tools.add(block.id);
        }
      }
      return applyConversationEvent(view, event);
    },
    result: () => ({ output, stopReason, error, model, usage, turns, toolCount: tools.size, aborted }),
    takeOutput() {
      const full = output;
      output = "";
      return full;
    },
    conversation: () => view.conversation,
    settle(status: SubagentStatus, failure?: string) {
      settleConversation(view, status);
      if (status === "failed" && failure && !view.conversation.some((message) => message.error === failure)) {
        view.conversation.push({ id: `${id}-assistant-${++view.messageSequence}`, role: "assistant", content: [], timestamp: Date.now(), error: failure });
      }
    },
  };
}

export function parseSubagentOutput(stdout: string) {
  const projection = createSubagentProjection("output");
  for (const line of stdout.split(/\r?\n/)) projection.accept(line);
  return projection.result();
}
