import { z } from "zod";
export const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const thinkingLevelSchema = z.enum(thinkingLevels);
