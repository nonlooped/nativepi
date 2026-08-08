import type { JsonValue } from "./json.ts";

/**
 * A synchronous runtime schema for a value crossing the extension channel.
 *
 * The host-provided Zod export and any other parser with a compatible `parse`
 * method can be used directly. Keeping this structural also leaves protocols
 * free to use a different validator when they need one.
 */
export interface ValueSchema<Output extends JsonValue | undefined = JsonValue | undefined> {
  parse(value: unknown): Output;
}

export interface MethodSchema<
  Params extends ValueSchema = ValueSchema,
  Result extends ValueSchema<JsonValue> = ValueSchema<JsonValue>,
> {
  /** Omit for a method that takes no parameters. */
  params?: Params;
  result: Result;
}

/** The runtime contract shared by an extension's Pi and renderer halves. */
export interface ExtensionProtocol {
  methods: Readonly<Record<string, MethodSchema>>;
  /** Use `undefined` for an event with no payload. */
  events: Readonly<Record<string, ValueSchema | undefined>>;
}

/** Preserve a protocol's exact method, event, and schema output types. */
export function defineProtocol<const Protocol extends ExtensionProtocol>(protocol: Protocol): Protocol {
  return protocol;
}

type SchemaOutput<Schema> = Schema extends ValueSchema<infer Output> ? Output : never;
type Methods<Protocol extends ExtensionProtocol> = Protocol["methods"];
type Events<Protocol extends ExtensionProtocol> = Protocol["events"];
type MethodName<Protocol extends ExtensionProtocol> = keyof Methods<Protocol> & string;
type EventName<Protocol extends ExtensionProtocol> = keyof Events<Protocol> & string;
type MethodParams<Method> = Method extends { params: infer Schema } ? SchemaOutput<Schema> : undefined;
type MethodResult<Method> = Method extends { result: infer Schema } ? SchemaOutput<Schema> : never;
type EventPayload<Event> = SchemaOutput<Event>;
type MaybePromise<Value> = Value | Promise<Value>;

type OptionalArguments<Value> = [Value] extends [undefined]
  ? []
  : undefined extends Value
    ? [value?: Value]
    : [value: Value];

export type MethodArguments<Method> = OptionalArguments<MethodParams<Method>>;
export type EventArguments<Event> = OptionalArguments<EventPayload<Event>>;

/** The typed channel available to graphical renderer contributions. */
export interface RendererChannel<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  call<Name extends MethodName<Protocol>>(
    method: Name,
    ...args: MethodArguments<Methods<Protocol>[Name]>
  ): Promise<MethodResult<Methods<Protocol>[Name]>>;

  on<Name extends EventName<Protocol>>(
    event: Name,
    handler: (...args: EventArguments<Events<Protocol>[Name]>) => void,
  ): () => void;
}

export type ExtensionMethodHandlers<Protocol extends ExtensionProtocol> = {
  [Name in MethodName<Protocol>]: (
    ...args: MethodArguments<Methods<Protocol>[Name]>
  ) => MaybePromise<MethodResult<Methods<Protocol>[Name]>>;
};

/** The channel returned to the ordinary Pi extension. */
export interface ExtensionHost<Protocol extends ExtensionProtocol> {
  /** Whether this Pi process is currently hosted by NativePi. */
  readonly connected: boolean;

  emit<Name extends EventName<Protocol>>(
    event: Name,
    ...args: EventArguments<Events<Protocol>[Name]>
  ): void;
}
