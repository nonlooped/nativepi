import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const serviceTierSchema = z.enum(["standard", "fast"]);
export type ServiceTier = z.infer<typeof serviceTierSchema>;

export const tierStateSchema = z.object({
  supported: z.boolean(),
  tier: serviceTierSchema,
});
export type TierState = z.infer<typeof tierStateSchema>;

export const serviceTierProtocol = defineProtocol({
  methods: {
    state: { result: tierStateSchema },
    set: {
      params: z.object({ tier: serviceTierSchema }),
      result: tierStateSchema,
    },
  },
  events: { changed: tierStateSchema },
});
