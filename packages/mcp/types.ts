import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const mcpScopeSchema = z.enum(["user", "project"]);
export type McpScope = z.infer<typeof mcpScopeSchema>;

const stringMapSchema = z.record(
  z.string(),
  z.string().refine((value) => !/[\r\n]/.test(value), {
    message: "Values cannot contain line breaks.",
  }),
);
export const editableMcpServerSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()),
    env: stringMapSchema.optional(),
    cwd: z.string().min(1).optional(),
  }),
  z.object({
    transport: z.literal("http"),
    url: z.url(),
    headers: stringMapSchema.optional(),
  }),
]);
export type EditableMcpServer = z.infer<typeof editableMcpServerSchema>;

const serverNameSchema = z.string().min(1).max(100)
  .refine((name) => name.trim() === name, {
    message: "Server names cannot start or end with whitespace.",
  })
  .refine((name) => !/[\r\n]/.test(name), {
    message: "Server names cannot contain line breaks.",
  });

export const mcpServerEntrySchema = z.object({
  name: z.string(),
  scope: mcpScopeSchema,
  config: editableMcpServerSchema,
  status: z.enum(["connected", "error", "overridden"]),
  toolCount: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type McpServerEntry = z.infer<typeof mcpServerEntrySchema>;

export const mcpStateSchema = z.object({
  projectTrusted: z.boolean(),
  servers: z.array(mcpServerEntrySchema),
  diagnostics: z.array(z.string()),
});
export type McpState = z.infer<typeof mcpStateSchema>;

const serverTargetSchema = z.object({ scope: mcpScopeSchema, name: z.string() });

export const mcpProtocol = defineProtocol({
  methods: {
    state: { result: mcpStateSchema },
    save: {
      params: z.object({
        scope: mcpScopeSchema,
        originalName: z.string().optional(),
        name: serverNameSchema,
        config: editableMcpServerSchema,
      }),
      result: mcpStateSchema,
    },
    remove: { params: serverTargetSchema, result: mcpStateSchema },
  },
  events: { changed: mcpStateSchema },
});
