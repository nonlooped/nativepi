import { applyAssistantDelta, isAssistantMessageDelta } from "../../shared/assistantStream.ts";
import { isAssistant } from "../../shared/messages.ts";
import type { PiMessage } from "../pi/protocol.ts";
/** Ephemeral display state only. Durable messages are always read from Pi's file. */
export class LiveView {
  private values = new Map<string, PiMessage>();
  accept(event: PiMessage) {
    if (event.type === "agent_start") this.values.set("run", event);
    if (event.type === "agent_settled") {
      this.values.delete("run"); this.values.delete("message"); this.values.delete("retry");
      for (const key of this.values.keys()) if ((key.startsWith("prompt:") || key.startsWith("tool:") || key.startsWith("progress:"))) this.values.delete(key);
    }
    if (event.type === "message_start" && isAssistant(event.message)) this.values.set("message", { type: "message_start", message: event.message });
    if (event.type === "message_update") {
      const message = this.values.get("message")?.message;
      if (isAssistant(message) && isAssistantMessageDelta(event.assistantMessageEvent)) this.values.set("message", { type: "message_start", message: applyAssistantDelta(message, event.assistantMessageEvent) });
    }
    if (event.type === "tool_execution_start") this.values.set(`tool:${event.toolCallId}`, event);
    if (event.type === "tool_execution_update") this.values.set(`progress:${event.toolCallId}`, event);
    if (event.type === "tool_execution_end") { this.values.delete(`tool:${event.toolCallId}`); this.values.delete(`progress:${event.toolCallId}`); }
    if (event.type === "message_end" && (event.message as { role?: string })?.role === "assistant") this.values.delete("message");
    if (event.type === "queue_update") this.values.set("queue", event);
    if (event.type === "auto_retry_start") this.values.set("retry", event);
    if (event.type === "auto_retry_end") this.values.delete("retry");
    if (event.type === "compaction_start") this.values.set("compaction", event);
    if (event.type === "compaction_end") this.values.delete("compaction");
    if (event.type === "extension_ui_request") {
      if (["select", "input", "confirm", "editor"].includes(String(event.method))) this.values.set(`prompt:${event.id}`, event);
      if (event.method === "setStatus") this.values.set(`status:${event.statusKey}`, event);
      if (event.method === "setWidget") this.values.set(`widget:${event.widgetKey}`, event);
    }
  }
  answered(id: string) { this.values.delete(`prompt:${id}`); }
  snapshot(): PiMessage[] { return [...this.values.values()]; }
}
