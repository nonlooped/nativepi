/**
 * The Pi RPC boundary.
 *
 * Pi speaks LF-delimited JSON on stdout: responses (`type: "response"`) and
 * streamed `AgentSessionEvent`s. Pi owns the full schema and NativePi only reads
 * a few fields, so the only thing worth checking here is that a line is an
 * object carrying a string `type` — every other field is passed through
 * untouched so Pi can add to the protocol without NativePi dropping messages.
 */
export type PiMessage = { type: string; [key: string]: unknown };

export function isPiMessage(value: unknown): value is PiMessage {
  return !!value && typeof value === "object" && typeof (value as PiMessage).type === "string";
}

/** Commands NativePi writes to Pi's stdin. A subset of Pi's RpcCommand union. */
export type PiCommand =
  | { id?: string; type: "prompt"; message: string; streamingBehavior?: "steer" | "followUp" }
  | { id?: string; type: "steer"; message: string }
  | { id?: string; type: "follow_up"; message: string }
  | { id?: string; type: "abort" }
  | { id?: string; type: "get_state" }
  | { id?: string; type: "new_session"; parentSession?: string }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "get_available_thinking_levels" }
  | { id?: string; type: "set_thinking_level"; level: string }
  | { id?: string; type: "set_session_name"; name: string }
  | { id?: string; type: "fork"; entryId: string }
  | { id?: string; type: "clone" }
  | { id?: string; type: "get_fork_messages" }
  | { id?: string; type: "get_tree" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }
  | { id?: string; type: "export_html"; outputPath?: string };

/**
 * Serialize one command as a strict JSON line.
 *
 * Framing is LF-only (see Pi's jsonl module): the payload may itself contain
 * U+2028/U+2029, so the delimiter must be `\n` and nothing else.
 */
export function serializeCommand(command: PiCommand): string {
  return JSON.stringify(command) + "\n";
}

/**
 * Split a rolling buffer into complete LF-terminated lines, returning the
 * parsed+validated messages and whatever incomplete remainder is left over.
 */
export function drainLines(buffer: string): { messages: PiMessage[]; rest: string } {
  const messages: PiMessage[] = [];
  let start = 0;
  let nl = buffer.indexOf("\n", start);
  while (nl !== -1) {
    const line = buffer.slice(start, nl).trim();
    start = nl + 1;
    nl = buffer.indexOf("\n", start);
    if (!line) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue; // Ignore non-JSON noise (e.g. stray logging).
    }
    if (isPiMessage(json)) messages.push(json);
  }
  return { messages, rest: buffer.slice(start) };
}
