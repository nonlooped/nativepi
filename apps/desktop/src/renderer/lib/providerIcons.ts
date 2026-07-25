const PROVIDER_ICON_ALIASES: Record<string, string> = {
  "amazon-bedrock": "bedrock",
  "ant-ling": "antgroup",
  "azure-openai-responses": "azure",
  "cloudflare-ai-gateway": "cloudflare",
  "cloudflare-workers-ai": "cloudflare",
  "github-copilot": "githubcopilot",
  "google-gemini-cli": "google",
  "google-vertex": "vertexai",
  "kimi-coding": "moonshot",
  "minimax-cn": "minimax",
  moonshotai: "moonshot",
  "moonshotai-cn": "moonshot",
  "openai-codex": "openai",
  "opencode-go": "opencode",
  "qwen-token-plan": "qwen",
  "qwen-token-plan-cn": "qwen",
  "vercel-ai-gateway": "vercel",
  xiaomi: "xiaomimimo",
  "xiaomi-token-plan-ams": "xiaomimimo",
  "xiaomi-token-plan-cn": "xiaomimimo",
  "xiaomi-token-plan-sgp": "xiaomimimo",
  zai: "zhipu",
  "zai-coding-cn": "zhipu",
};

export function providerIconName(providerId: string): string {
  return PROVIDER_ICON_ALIASES[providerId] ?? providerId;
}
