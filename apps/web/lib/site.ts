/**
 * Every fact on the site comes from here, and every fact here comes from
 * PRODUCT.md, the README, or source. Nothing in this file may be a claim the
 * project cannot back: no download counts, no star counts, no benchmarks.
 */

export const site = {
  name: "NativePi",
  tagline: "Pi, at home on your desktop.",
  description:
    "A free, open-source desktop interface for the Pi coding agent, for Windows, macOS, and Linux. Pi keeps the agent loop. Your sessions stay yours.",
  url: "https://nativepi.vercel.app",
  repo: "https://github.com/nonlooped/nativepi",
  releases: "https://github.com/nonlooped/nativepi/releases",
  releasesLatest: "https://github.com/nonlooped/nativepi/releases/latest",
  issues: "https://github.com/nonlooped/nativepi/issues",
  license: "https://github.com/nonlooped/nativepi/blob/main/LICENSE",
  extensionApi:
    "https://github.com/nonlooped/nativepi/tree/main/packages/extension-api",
  pi: "https://pi.dev/",
  author: "nonlooped",
} as const;

/** Providers Pi can authenticate. Marks are official and unmodified. */
export const providers = [
  { file: "anthropic.svg", name: "Anthropic", mono: true },
  { file: "openai.svg", name: "OpenAI", mono: true },
  { file: "gemini-color.svg", name: "Google Gemini", mono: false },
  { file: "xai.svg", name: "xAI", mono: true },
  { file: "mistral-color.svg", name: "Mistral", mono: false },
  { file: "deepseek-color.svg", name: "DeepSeek", mono: false },
  { file: "qwen-color.svg", name: "Qwen", mono: false },
  { file: "moonshot.svg", name: "Moonshot", mono: true },
  { file: "zhipu-color.svg", name: "Zhipu", mono: false },
  { file: "minimax-color.svg", name: "MiniMax", mono: false },
  { file: "groq.svg", name: "Groq", mono: true },
  { file: "githubcopilot.svg", name: "GitHub Copilot", mono: true },
  { file: "openrouter-color.svg", name: "OpenRouter", mono: false },
  { file: "bedrock-color.svg", name: "Amazon Bedrock", mono: false },
  { file: "vertexai-color.svg", name: "Google Vertex AI", mono: false },
  { file: "ollama.svg", name: "Ollama", mono: true },
] as const;
