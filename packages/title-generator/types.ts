import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const titleGeneratorModelSchema = z.object({
  key: z.string(),
  label: z.string(),
});
export type TitleGeneratorModel = z.infer<typeof titleGeneratorModelSchema>;

export const titleGeneratorStateSchema = z.object({
  modelSetting: z.string(),
  models: z.array(titleGeneratorModelSchema),
});
export type TitleGeneratorState = z.infer<typeof titleGeneratorStateSchema>;

export const titleGeneratorProtocol = defineProtocol({
  methods: {
    state: { result: titleGeneratorStateSchema },
    set: {
      params: z.object({ modelSetting: z.string().min(1) }),
      result: titleGeneratorStateSchema,
    },
  },
  events: { changed: titleGeneratorStateSchema },
});
