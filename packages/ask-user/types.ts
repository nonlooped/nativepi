import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const askUserOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  recommended: z.boolean(),
});
export type AskUserOption = z.infer<typeof askUserOptionSchema>;

export const askUserQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(askUserOptionSchema).min(2),
});
export type AskUserQuestion = z.infer<typeof askUserQuestionSchema>;

export const askUserResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("option"), index: z.number().int().nonnegative() }),
  z.object({ type: z.literal("custom"), text: z.string().trim().min(1) }),
  z.object({ type: z.literal("cancel") }),
]);
export type AskUserResponse = z.infer<typeof askUserResponseSchema>;

export const askUserAnswerSchema = z.discriminatedUnion("type", [
  askUserOptionSchema.extend({ type: z.literal("option"), index: z.number().int().positive() }),
  z.object({ type: z.literal("custom"), text: z.string().min(1) }),
]);
export type AskUserAnswer = z.infer<typeof askUserAnswerSchema>;

export const askUserDetailsSchema = askUserQuestionSchema.extend({
  answer: askUserAnswerSchema.nullable(),
  cancelled: z.boolean(),
});
export type AskUserDetails = z.infer<typeof askUserDetailsSchema>;

export const askUserProtocol = defineProtocol({
  methods: {
    answer: {
      params: z.object({ toolCallId: z.string().min(1), response: askUserResponseSchema }),
      result: z.object({ accepted: z.literal(true) }),
    },
  },
  events: {},
});
