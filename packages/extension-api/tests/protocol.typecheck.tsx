import { defineProtocol, defineRenderer } from "../src/index.ts";
import type { JsonValue, RendererContext, ValueSchema } from "../src/index.ts";
import { connect } from "../src/host.ts";

const schema = <Value extends JsonValue | undefined>(): ValueSchema<Value> => ({
  parse: (value) => value as Value,
});

const stateSchema = schema<{ count: number }>();
const protocol = defineProtocol({
  methods: {
    state: { result: stateSchema },
    increment: {
      params: schema<{ by: number }>(),
      result: stateSchema,
    },
    find: {
      params: schema<{ query: string } | undefined>(),
      result: schema<string[]>(),
    },
  },
  events: {
    changed: stateSchema,
    invalidated: undefined,
  },
});

declare const context: RendererContext<typeof protocol>;
void context.channel.call("state").then((state) => state.count);
void context.channel.call("increment", { by: 2 }).then((state) => state.count);
void context.channel.call("find").then((matches) => matches.length);
context.channel.on("changed", (state) => state.count);
context.channel.on("invalidated", () => {});

// @ts-expect-error Required method parameters cannot be omitted.
void context.channel.call("increment");
// @ts-expect-error Method parameters retain their schema output type.
void context.channel.call("increment", { by: "two" });
// @ts-expect-error Undeclared methods are not callable.
void context.channel.call("missing");
// @ts-expect-error Event payloads retain their schema output type.
context.channel.on("changed", (state: { count: string }) => state.count);

const host = connect("@acme/counter", protocol, {
  state: () => ({ count: 0 }),
  increment: ({ by }) => ({ count: by }),
  find: (params) => [params?.query ?? ""],
});
host.emit("changed", { count: 1 });
host.emit("invalidated");
// @ts-expect-error Payload required by the event schema.
host.emit("changed");
// @ts-expect-error Payload-free events reject a payload.
host.emit("invalidated", null);

defineRenderer({
  apiVersion: 1,
  protocol,
  composerWidgets: [
    {
      id: "counter",
      placement: "aboveComposer",
      render: (rendererContext) => {
        void rendererContext.channel.call("state");
        return null;
      },
    },
  ],
});

// @ts-expect-error The API version is an explicit compatibility contract.
defineRenderer({ apiVersion: 2 });
