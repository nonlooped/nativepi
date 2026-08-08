import type { JsonValue } from "./json.ts";
import type {
  EventArguments,
  ExtensionHost,
  ExtensionMethodHandlers,
  ExtensionProtocol,
  MethodArguments,
  ValueSchema,
} from "./protocol.ts";

type RegisteredMethod = (params: JsonValue | undefined) => JsonValue | Promise<JsonValue>;

interface NativePiExtensionHost {
  register(extension: string, methods: Readonly<Record<string, RegisteredMethod>>): void;
  emit(extension: string, event: string, payload: JsonValue | undefined): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __NATIVEPI_EXTENSION_HOST__: NativePiExtensionHost | undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parse<Output extends JsonValue | undefined>(schema: ValueSchema<Output>, value: unknown, label: string): Output {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(`${label}: ${errorMessage(error)}`, { cause: error });
  }
}

/**
 * Connect an ordinary Pi extension to its graphical renderer.
 *
 * Registration is atomic: calling `connect` again for the same package replaces
 * its complete method table, so reloads cannot leave removed methods behind.
 * Outside NativePi the same schemas and handlers remain valid, while `emit` is
 * a no-op and `connected` is false.
 */
export function connect<Protocol extends ExtensionProtocol>(
  extension: string,
  protocol: Protocol,
  handlers: ExtensionMethodHandlers<Protocol>,
): ExtensionHost<Protocol> {
  if (!extension.trim()) throw new Error("A NativePi extension package name is required.");

  const registered: Record<string, RegisteredMethod> = {};
  const untypedHandlers = handlers as unknown as Record<string, (...args: never[]) => JsonValue | Promise<JsonValue>>;
  const declaredMethods = Object.keys(protocol.methods);

  for (const name of declaredMethods) {
    const method = protocol.methods[name]!;
    const handler = untypedHandlers[name];
    if (typeof handler !== "function") throw new Error(`Extension ${extension} did not implement method "${name}".`);
    registered[name] = async (params) => {
      let args: unknown[] = [];
      if (method.params) args = [parse(method.params, params, `Invalid parameters for "${name}"`)];
      else if (params !== undefined) throw new Error(`Method "${name}" does not take parameters.`);
      const result = await handler(...(args as never[]));
      return parse(method.result, result, `Invalid result from "${name}"`);
    };
  }

  for (const name of Object.keys(handlers)) {
    if (!(name in protocol.methods)) throw new Error(`Extension ${extension} implemented undeclared method "${name}".`);
  }

  const nativeHost = globalThis.__NATIVEPI_EXTENSION_HOST__;
  nativeHost?.register(extension, registered);

  return {
    connected: nativeHost !== undefined,
    emit(event, ...args) {
      const name = event as string;
      if (!(name in protocol.events)) throw new Error(`Extension ${extension} emitted undeclared event "${name}".`);
      const schema = protocol.events[name];
      const payload = (args as [unknown?])[0];
      if (!schema) {
        if (payload !== undefined) throw new Error(`Event "${name}" does not take a payload.`);
        nativeHost?.emit(extension, name, undefined);
        return;
      }
      nativeHost?.emit(extension, name, parse(schema, payload, `Invalid payload for "${name}"`));
    },
  } as ExtensionHost<Protocol>;
}

export type {
  EventArguments,
  ExtensionHost,
  ExtensionMethodHandlers,
  ExtensionProtocol,
  MethodArguments,
};
