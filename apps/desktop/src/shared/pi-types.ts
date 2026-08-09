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

/** Pi's non-cumulative assistant stream events, sent between message_start and message_end. */
export type AssistantMessageDelta =
  | { type: "start" }
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; content: string }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number; content: string }
  | { type: "toolcall_start"; contentIndex: number }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall }
  | { type: "done"; reason: "stop" | "length" | "toolUse"; message: AssistantMessage }
  | { type: "error"; reason: "aborted" | "error"; error: AssistantMessage };


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

/** Cost totals derived from the usage records Pi writes to session files. */
export interface UsageDashboard {
  totalCost: number;
  sessions: number;
  daily: { date: string; cost: number; tokens: number; sessions: number; models: { name: string; cost: number; tokens: number }[] }[];
  projects: { path: string; name: string; cost: number; tokens: number }[];
  models: { name: string; cost: number; tokens: number }[];
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

/** Pi's latest read-only context-window measurement. */
export interface ContextInspector {
  usedTokens: number | null;
  contextWindow: number;
}

export interface SessionSummary {
  path: string;
  id: string;
  name?: string;
  firstMessage: string;
  lastPrompt: string;
  /** Distinct providers used in the chat, most recent first. */
  providers: string[];
  messageCount: number;
  created: string;
  modified: string;
}

export interface SessionSearchResult {
  projectDir: string;
  sessionFile: string;
  title: string;
  modified: string;
  match: "title" | "user" | "assistant";
  snippet: string;
}


export interface GitChangedFile {
  path: string;
  state: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
  unstaged: boolean;
}
export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  detached?: boolean;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: GitChangedFile[];
  insertions: number;
  deletions: number;
}
export interface GitCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  timestamp: string;
  subject: string;
  refs: string[];
  graph: string;
  pushed: boolean;
}
export interface GitDiff {
  path: string;
  patch: string;
}
export interface GitHunk {
  header: string;
  patch: string;
}
/** Where a pull request from this checkout would land, read before the push is confirmed. */
export interface GitPrTarget {
  /** The branch that would be pushed, absent on a detached HEAD. */
  branch?: string;
  /** The default branch the pull request would target, absent when `gh` cannot read the repository. */
  base?: string;
  /** The `origin` push URL, absent when the repository has no such remote. */
  remote?: string;
  /** Why a pull request cannot be opened from here, stated before the user tries. */
  blocker?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  /** Absolute path of another worktree holding this branch, if one does. */
  worktree?: string;
}

/**
 * One entry in the file explorer: a single child of one directory.
 *
 * There is no `children` field on purpose. The explorer asks for one directory
 * at a time and holds the shape of the tree in the renderer, so nothing here
 * ever describes a folder the user has not opened.
 */
export interface ExplorerEntry {
  /** The entry's own name, as it is shown in the row. */
  name: string;
  /** Forward-slashed and relative to the project root, for Git and IPC alike. */
  path: string;
  kind: "dir" | "file";
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
  origin: "package" | "top-level";
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
  | { type: "message_update"; assistantMessageEvent: AssistantMessageDelta }
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
