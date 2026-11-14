import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** Read-only reference discovery is available in both Chat and Work. */
export function registerMentions(pi: ExtensionAPI) {
  pi.registerTool({
    name: "mention_catalog",
    label: "Find models and threads",
    description: "Find models from the user's Pi catalog or threads across all Pi sessions. Use the returned reference verbatim in responses to mention a model or link a thread. References do not switch models or copy thread contents. Search by name, provider, model ID, or working directory. Paginate with offset.",
    parameters: Type.Object({ kind: Type.Union([Type.Literal("models"), Type.Literal("threads")]), query: Type.Optional(Type.String()), offset: Type.Optional(Type.Integer({ minimum: 0 })) }),
    async execute(_id, params, signal, _update, context) {
      signal?.throwIfAborted();
      const entries = params.kind === "models"
        ? context.modelRegistry.getAvailable().map(model => ({ name: model.name, provider: model.provider, id: model.id, reference: `nativepi://model?${new URLSearchParams({ provider: model.provider, id: model.id })}` }))
        : (await SessionManager.listAll(undefined, undefined, signal)).map(session => ({ name: session.name || session.firstMessage, cwd: session.cwd, id: session.id, reference: `nativepi://thread?${new URLSearchParams({ session: session.path })}` }));
      const filtered = entries.filter(entry => JSON.stringify(entry).toLowerCase().includes((params.query ?? "").toLowerCase()));
      const offset = params.offset ?? 0;
      const result = { entries: filtered.slice(offset, offset + 50), nextOffset: offset + 50 < filtered.length ? offset + 50 : null };
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
}
