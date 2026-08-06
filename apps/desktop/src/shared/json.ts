import { z } from "zod";
import type { JsonValue } from "@nativepi/extension-api";

export type { JsonValue } from "@nativepi/extension-api";

/**
 * Whether a value is a JSON tree, rather than merely something JSON.stringify
 * happens to coerce. In particular this rejects cycles, bigint, non-finite
 * numbers, sparse arrays, accessors, and class instances before a frame writer
 * can touch them.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueInternal(value, new Set());
}

function isJsonValueInternal(value: unknown, ancestors: Set<object>) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !isJsonValueInternal(descriptor.value, ancestors)) return false;
      }
      return Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length);
    }

    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0 || Object.prototype.hasOwnProperty.call(value, "toJSON")) return false;
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !isJsonValueInternal(descriptor.value, ancestors)) return false;
    }
    return Object.getOwnPropertyNames(value).length === Object.keys(value).length;
  } finally {
    ancestors.delete(value);
  }
}

/** Zod boundary schema for the recursive JSON value type. */
export const jsonValueSchema = z.custom<JsonValue>(isJsonValue, { message: "Expected a JSON value" });
