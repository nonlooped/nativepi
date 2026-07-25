const PROVIDER_ICON_ALIASES: Record<string, string> = {
  "amazon-bedrock": "bedrock",
  "ant-ling": "antgroup",
  "azure-openai-responses": "azure",
  "cloudflare-ai-gateway": "cloudflare",
  "cloudflare-workers-ai": "cloudflare",
  fireworks: "fireworksai",
  "github-copilot": "githubcopilot",
  "google-gemini-cli": "google",
  "google-vertex": "vertexai",
  "kimi-coding": "kimicodingplan",
  "minimax-cn": "minimax",
  moonshotai: "moonshot",
  "moonshotai-cn": "moonshot",
  "openai-codex": "openai",
  opencode: "opencodezen",
  "opencode-go": "opencodego",
  "qwen-token-plan": "qwen",
  "qwen-token-plan-cn": "qwen",
  together: "togetherai",
  "vercel-ai-gateway": "vercelaigateway",
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
