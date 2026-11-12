import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { serviceTiers, SERVICE_TIER_ENTRY, recordedServiceTier } from "./serviceTier.ts";
import { Type } from "typebox";

/** App-shipped tools still run through Pi's tool validation, execution, and session log. */
export default function appTools(pi: ExtensionAPI): void {
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
        auto: "Automatic — use the provider default",
        default: "Standard — normal pricing and speed",
        priority: "Priority — faster responses, higher usage or cost",
        flex: "Flex — lower cost, slower responses; availability varies by model",
        standard_only: "Standard only — do not use reserved Priority capacity",
      };
      const requested = args.trim().toLowerCase();
      const choices = tiers.map(tier => `${labels[tier]}${tier === current ? " (current)" : ""}`);
      const choice = requested || await context.ui.select("Service tier", choices);
      if (!choice) return;
      const tier = requested || tiers[choices.indexOf(choice)];
      if (!tier || !tiers.includes(tier)) {
        context.ui.notify(`Choose one of: ${tiers.join(", ")}.`, "warning");
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
