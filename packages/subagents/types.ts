import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const subagentSettingsSchema = z.object({
  userMaxConcurrency: z.number().int().min(1).max(32),
  effectiveMaxConcurrency: z.number().int().min(1).max(32),
  projectMaxConcurrency: z.number().int().min(1).max(32).nullable(),
});
export type SubagentSettings = z.infer<typeof subagentSettingsSchema>;

export const subagentsProtocol = defineProtocol({
  methods: {
    state: { result: subagentSettingsSchema },
    setMaxConcurrency: {
      params: z.object({ maxConcurrency: z.number().int().min(1).max(32) }),
      result: subagentSettingsSchema,
    },
  },
  events: { changed: subagentSettingsSchema },
});
