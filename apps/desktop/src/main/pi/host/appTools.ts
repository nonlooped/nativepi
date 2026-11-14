import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { serviceTiers, SERVICE_TIER_ENTRY, recordedServiceTier } from "./serviceTier.ts";
import { Type } from "typebox";
import { registerArtifacts } from "./artifacts.ts";
import webAccess from "./webAccess.ts";
import chatMode from "./chatMode.ts";

/** App-shipped tools still run through Pi's tool validation, execution, and session log. */
export default function appTools(pi: ExtensionAPI): void {
  webAccess(pi);
  registerArtifacts(pi);
  if (process.argv.includes("--nativepi-chat")) chatMode(pi);
  pi.registerCommand("speed", {
    description: "Choose this chat's provider service tier",
    handler: async (args, context) => {
      if (!context.isIdle()) throw new Error("Wait for the current response before changing service tier.");
      const tiers = serviceTiers(context.model);
      if (!tiers.length) {
        context.ui.notify("This provider does not offer service-tier selection here.", "info");
        return;
      }
      const current = recordedServiceTier(context.sessionManager.getEntries());
      const labels: Record<string, string> = {
        default: "Standard — normal pricing and speed",
        priority: "Priority — faster responses, higher usage or cost",
      };
      const argument = args.trim().toLowerCase();
      const requested = argument === "standard" ? "default" : argument;
      const choices = tiers.map(tier => `${labels[tier]}${tier === current ? " (current)" : ""}`);
      const choice = requested || await context.ui.select("Service tier", choices);
      if (!choice) return;
      const tier = requested || tiers[choices.indexOf(choice)];
      if (!tier || !tiers.some(value => value === tier)) {
        context.ui.notify(`Choose standard or priority.`, "warning");
        return;
      }
      pi.appendEntry(SERVICE_TIER_ENTRY, { tier });
      context.ui.notify(`Service tier: ${labels[tier]}. Provider and model eligibility still apply.`, "info");
    },
  });
  pi.registerTool({
    name: "ask_user",
    label: "Ask user",
    description: "Ask the user a focused question when missing information would materially change the result. Offer optional choices; the user can always write their own answer. Cancellation is not approval.",
    parameters: Type.Object({
      question: Type.String({ minLength: 1, maxLength: 2000 }),
      options: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 2, maxItems: 8, uniqueItems: true })),
    }),
    executionMode: "sequential",
    async execute(_id, params, signal, _update, context) {
      if (!context.hasUI) throw new Error("Asking the user requires an interactive session.");
      signal?.throwIfAborted();
      let answer: string | undefined;
      if (params.options) {
        const choices = params.options.map((option, index) => `${index + 1}. ${option}`);
        const selected = await context.ui.select(params.question, [...choices, "Write an answer…"], { signal });
        if (selected === "Write an answer…") answer = await context.ui.input(params.question, "Your answer", { signal });
        else if (selected !== undefined) answer = params.options[choices.indexOf(selected)];
      } else answer = await context.ui.input(params.question, "Your answer", { signal });
      signal?.throwIfAborted();
      answer = answer?.trim();
      return {
        content: [{ type: "text", text: answer ? `User answered: ${answer}` : "The user dismissed this question without answering. Do not treat this as consent or a choice." }],
        details: { question: params.question, answer: answer || null, cancelled: !answer },
      };
    },
  });
}
