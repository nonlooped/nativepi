/**
 * A pragmatic subset of Pi's data model, mirrored for use on both sides of the
 * host<->renderer boundary.
 *
 * Pi owns the authoritative schema (see `@earendil-works/pi-coding-agent`). We
 * only redeclare the shapes NativePi actually reads, and keep every type open to
 * unknown fields so Pi can evolve without breaking rendering. The host validates
 * loosely at the process boundary; the renderer treats these defensively.
 */

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface TextContent {
  type: "text";
  text: string;
}
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  redacted?: boolean;
}
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export type AssistantContent = TextContent | ThinkingContent | ToolCall;

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost?: { total: number };
}

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  model?: string;
  provider?: string;
  usage?: Usage;
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
}
export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | { role: string; [key: string]: unknown };


export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}
interface EntryBase {
  id: string;
  parentId: string | null;
  timestamp: string;
}
export interface SessionMessageEntry extends EntryBase {
  type: "message";
  message: AgentMessage;
}
export interface ModelChangeEntry extends EntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}
export interface ThinkingLevelChangeEntry extends EntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}
export interface CompactionEntry extends EntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
}
export interface SessionInfoEntry extends EntryBase {
  type: "session_info";
  name?: string;
}
export interface UnknownEntry extends EntryBase {
  type: string;
  [key: string]: unknown;
}
export type SessionEntry =
  | SessionMessageEntry
  | ModelChangeEntry
  | ThinkingLevelChangeEntry
  | CompactionEntry
  | SessionInfoEntry
  | UnknownEntry;
export type FileEntry = SessionHeader | SessionEntry;


export interface ModelInfo {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
}

export interface RpcSessionState {
  model?: ModelInfo;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  messageCount: number;
  pendingMessageCount: number;
}

export interface ForkPoint {
  entryId: string;
  text: string;
}

export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  labelTimestamp?: string;
}

export interface SessionStats {
  sessionFile?: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
}

export interface SessionSummary {
  path: string;
  id: string;
  name?: string;
  firstMessage: string;
  messageCount: number;
  created: string;
  modified: string;
}


export interface GitChangedFile {
  path: string;
  state: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}
export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  detached?: boolean;
  files: GitChangedFile[];
}
export interface GitDiff {
  path: string;
  patch: string;
}
export interface GitBranch {
  name: string;
  current: boolean;
  /** Absolute path of another worktree holding this branch, if one does. */
  worktree?: string;
}


/** One skill the composer's `$` menu can insert as a `/skill:name` command. */
export interface SkillInfo {
  name: string;
  description: string;
  /** Where it came from, which is the only thing the menu says about provenance. */
  scope: "user" | "project";
}


/**
 * One command Pi will expand or execute when a message opens with `/name`.
 *
 * Pi's own `get_commands` is the only list: extension commands, prompt templates
 * and skills all arrive here already resolved for this project, so the composer
 * offers exactly what Pi would accept and nothing NativePi guessed at.
 */
export interface CommandInfo {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  location?: "user" | "project" | "path";
}

export interface PackageInfo {
  source: string;
  scope: "user" | "project";
  filtered: boolean;
  installedPath?: string;
}
export interface ResolvedExtension {
  path: string;
  enabled: boolean;
  scope: string;
  source: string;
}

export interface GraphicalExtension {
  id: string;
  name: string;
  code: string;
  error?: string;
}

export type ExtensionUiRequest =
  | { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
  | { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
  | { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText: string | undefined }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setWidget";
      widgetKey: string;
      widgetLines: string[] | undefined;
      widgetPlacement?: "aboveEditor" | "belowEditor";
    }
  | { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
  | { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

export type ExtensionUiResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };


export type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; willRetry?: boolean }
  | { type: "agent_settled" }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage }
  | { type: "message_end"; message: AgentMessage }
  | { type: "entry_appended"; entry: SessionEntry }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "session_info_changed"; name?: string }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "compaction_start"; reason: string }
  | { type: "compaction_end"; aborted: boolean; willRetry?: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: string; [key: string]: unknown };
