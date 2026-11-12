import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { mcpProtocol } from "../types.ts";
import { removeMcpServer, saveMcpServer } from "./config.ts";
import { createMcpRuntime } from "./runtime.ts";

export default function mcpExtension(pi: ExtensionAPI) {
  const runtime = createMcpRuntime(pi);
  const publish = async (result: ReturnType<typeof runtime.state>) => {
    const state = await result;
    nativepi.emit("changed", state);
    return state;
  };
  const nativepi = connect("@nativepi/mcp", mcpProtocol, {
    state: runtime.state,
    save: (input) => publish(runtime.change((context) =>
      saveMcpServer(context.cwd, context.isProjectTrusted(), input))),
    remove: ({ scope, name }) => publish(runtime.change((context) =>
      removeMcpServer(context.cwd, context.isProjectTrusted(), scope, name))),
  });
  pi.on("session_start", async (_event, context) => { await publish(runtime.start(context)); });
  pi.on("session_shutdown", async (_event, context) => { await runtime.shutdown(context); });
}
