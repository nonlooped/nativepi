import { CubeIcon } from "@phosphor-icons/react/Cube";
import antgroup from "@lobehub/icons-static-svg/icons/antgroup.svg?raw";
import antgroupColor from "@lobehub/icons-static-svg/icons/antgroup-color.svg?raw";
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?raw";
import antigravity from "@lobehub/icons-static-svg/icons/antigravity.svg?raw";
import antigravityColor from "@lobehub/icons-static-svg/icons/antigravity-color.svg?raw";
import azure from "@lobehub/icons-static-svg/icons/azure.svg?raw";
import azureColor from "@lobehub/icons-static-svg/icons/azure-color.svg?raw";
import bedrock from "@lobehub/icons-static-svg/icons/bedrock.svg?raw";
import bedrockColor from "@lobehub/icons-static-svg/icons/bedrock-color.svg?raw";
import cerebras from "@lobehub/icons-static-svg/icons/cerebras.svg?raw";
import cerebrasColor from "@lobehub/icons-static-svg/icons/cerebras-color.svg?raw";
import cloudflare from "@lobehub/icons-static-svg/icons/cloudflare.svg?raw";
import cloudflareColor from "@lobehub/icons-static-svg/icons/cloudflare-color.svg?raw";
import cursor from "@lobehub/icons-static-svg/icons/cursor.svg?raw";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg?raw";
import deepseekColor from "@lobehub/icons-static-svg/icons/deepseek-color.svg?raw";
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg?raw";
import fireworksColor from "@lobehub/icons-static-svg/icons/fireworks-color.svg?raw";
import githubcopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg?raw";
import google from "@lobehub/icons-static-svg/icons/google.svg?raw";
import googleColor from "@lobehub/icons-static-svg/icons/google-color.svg?raw";
import groq from "@lobehub/icons-static-svg/icons/groq.svg?raw";
import huggingface from "@lobehub/icons-static-svg/icons/huggingface.svg?raw";
import huggingfaceColor from "@lobehub/icons-static-svg/icons/huggingface-color.svg?raw";
import minimax from "@lobehub/icons-static-svg/icons/minimax.svg?raw";
import minimaxColor from "@lobehub/icons-static-svg/icons/minimax-color.svg?raw";
import mistral from "@lobehub/icons-static-svg/icons/mistral.svg?raw";
import mistralColor from "@lobehub/icons-static-svg/icons/mistral-color.svg?raw";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg?raw";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia.svg?raw";
import nvidiaColor from "@lobehub/icons-static-svg/icons/nvidia-color.svg?raw";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?raw";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?raw";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?raw";
import openrouterColor from "@lobehub/icons-static-svg/icons/openrouter-color.svg?raw";
import qwen from "@lobehub/icons-static-svg/icons/qwen.svg?raw";
import qwenColor from "@lobehub/icons-static-svg/icons/qwen-color.svg?raw";
import together from "@lobehub/icons-static-svg/icons/together.svg?raw";
import togetherColor from "@lobehub/icons-static-svg/icons/together-color.svg?raw";
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg?raw";
import vertexai from "@lobehub/icons-static-svg/icons/vertexai.svg?raw";
import vertexaiColor from "@lobehub/icons-static-svg/icons/vertexai-color.svg?raw";
import windsurf from "@lobehub/icons-static-svg/icons/windsurf.svg?raw";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?raw";
import xiaomimimo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg?raw";
import zhipu from "@lobehub/icons-static-svg/icons/zhipu.svg?raw";
import zhipuColor from "@lobehub/icons-static-svg/icons/zhipu-color.svg?raw";

const BRAND_ICONS: Record<string, { mono: string; color?: string }> = {
  antgroup: { mono: antgroup, color: antgroupColor },
  anthropic: { mono: anthropic },
  antigravity: { mono: antigravity, color: antigravityColor },
  azure: { mono: azure, color: azureColor },
  bedrock: { mono: bedrock, color: bedrockColor },
  cerebras: { mono: cerebras, color: cerebrasColor },
  cloudflare: { mono: cloudflare, color: cloudflareColor },
  cursor: { mono: cursor },
  deepseek: { mono: deepseek, color: deepseekColor },
  fireworks: { mono: fireworks, color: fireworksColor },
  githubcopilot: { mono: githubcopilot },
  google: { mono: google, color: googleColor },
  groq: { mono: groq },
  huggingface: { mono: huggingface, color: huggingfaceColor },
  minimax: { mono: minimax, color: minimaxColor },
  mistral: { mono: mistral, color: mistralColor },
  moonshot: { mono: moonshot },
  nvidia: { mono: nvidia, color: nvidiaColor },
  openai: { mono: openai },
  opencode: { mono: opencode },
  openrouter: { mono: openrouter, color: openrouterColor },
  qwen: { mono: qwen, color: qwenColor },
  together: { mono: together, color: togetherColor },
  vercel: { mono: vercel },
  vertexai: { mono: vertexai, color: vertexaiColor },
  windsurf: { mono: windsurf },
  xai: { mono: xai },
  xiaomimimo: { mono: xiaomimimo },
  zhipu: { mono: zhipu, color: zhipuColor },
};

export default function BrandIcon({
  name,
  size = 16,
  color = false,
  className,
}: {
  name: string;
  size?: number;
  color?: boolean;
  className?: string;
}) {
  const icon = BRAND_ICONS[name];
  if (!icon) return <CubeIcon size={size} className={className} aria-hidden />;

  return (
    <span
      className={["inline-flex shrink-0", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, fontSize: size }}
      aria-hidden
      // These SVG strings are compile-time assets from the pinned icon package.
      dangerouslySetInnerHTML={{ __html: color && icon.color ? icon.color : icon.mono }}
    />
  );
}
