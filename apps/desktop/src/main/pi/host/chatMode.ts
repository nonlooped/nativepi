import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const CHAT_INSTRUCTIONS = `You are in Chat mode: help with questions, research, explanations, brainstorming, and drafts in the conversation. Coding explanations and code snippets in your reply are welcome.
Do not perform work tasks: do not create, edit, move, or delete workspace files; install packages; change settings; run builds; commit or push; or delegate tasks that make changes. Explain that such actions belong in Work mode. Inline HTML artifacts made with html_preview and html_render are conversation outputs and are encouraged when useful. Pass HTML directly; do not create workspace files to produce them.
You may read files, search, retrieve web pages, and use the shell for read-only lookups and system diagnostics such as identifying hardware with nvidia-smi. Shell access is for gathering information only, never for modifying files or system state or bypassing missing write tools. Apply these instructions to every enabled extension as well.
Do not assume this conversation belongs to a code project. Organizational chat folders do not supply instructions or context. If web tools report throttling or unavailability, tell the user and continue with what you know, clearly distinguishing it from verified current information.`;

export default function chatMode(pi: ExtensionAPI) {
  // Leave explicitly enabled extensions intact; remove Pi's built-in write tools.
  pi.on("session_start", async () => {
    const available = new Set(pi.getAllTools().map(tool => tool.name));
    pi.setActiveTools([...new Set([...pi.getActiveTools(), "read", "bash", "powershell", "grep", "find", "ls"])].filter(name => available.has(name) && name !== "edit" && name !== "write"));
  });
  pi.on("before_agent_start", async event => ({ systemPrompt: `${event.systemPrompt}\n\n${CHAT_INSTRUCTIONS}` }));
}
