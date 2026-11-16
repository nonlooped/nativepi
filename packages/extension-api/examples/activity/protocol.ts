import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";
const activity = z.object({ tools: z.number().int().nonnegative(), lastTool: z.string().nullable() });
export const protocol = defineProtocol({ methods: { state: { result: activity } }, events: { changed: activity } });
