import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { protocol } from "./protocol.ts";

/** One implementation observes Pi events; neither UI executes agent work. */
export default function activity(pi: ExtensionAPI) {
  let state = { tools: 0, lastTool: null as string | null };
  const ui = connect("nativepi-example-activity", protocol, { state: () => state });
  pi.on("session_start", () => { state = { tools: 0, lastTool: null }; });
  pi.on("tool_execution_start", (event, ctx) => {
    state = { tools: state.tools + 1, lastTool: event.toolName };
    ctx.ui.setStatus("activity", `${state.tools} tools · ${event.toolName}`);
    if (ui.connected) ui.emit("changed", state);
  });
  pi.registerCommand("activity", {
    description: "Show tool activity since this runtime started",
    handler: async (_args, ctx) => { ctx.ui.notify(`${state.tools} tools · Last: ${state.lastTool ?? "none"}`, "info"); },
  });
  pi.on("session_shutdown", () => ui.dispose());
}
