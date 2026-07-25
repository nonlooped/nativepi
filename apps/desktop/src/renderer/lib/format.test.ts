import { describe, expect, test } from "bun:test";
import { formatDuration, formatElapsed, formatLineDelta, formatTokens, pluralize } from "./format.ts";

describe("formatElapsed", () => {
  test("steps from seconds to hours", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(47_000)).toBe("47s");
    expect(formatElapsed(133_000)).toBe("2m 13s");
    expect(formatElapsed(120_000)).toBe("2m");
    expect(formatElapsed(3_840_000)).toBe("1h 4m");
  });

  test("has nothing to say about an impossible duration", () => {
    expect(formatElapsed(-1)).toBe("");
    expect(formatElapsed(Number.NaN)).toBe("");
  });
});

describe("formatDuration", () => {
  test("reports an unparseable timestamp as unknown rather than instant", () => {
    expect(formatDuration(undefined, undefined)).toBe("an unknown time");
    expect(formatDuration("not a date", "2026-01-01T00:00:00Z")).toBe("an unknown time");
  });

  test("measures the span between two timestamps", () => {
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:00.400Z")).toBe("<1s");
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:02:13Z")).toBe("2m 13s");
  });
});

describe("formatLineDelta", () => {
  test("omits a side that did not change", () => {
    expect(formatLineDelta(42, 7)).toBe("+42 −7");
    expect(formatLineDelta(42, 0)).toBe("+42");
    expect(formatLineDelta(0, 7)).toBe("−7");
    expect(formatLineDelta(0, 0)).toBe("");
  });
});

describe("formatTokens", () => {
  test("abbreviates at each magnitude", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(12_400)).toBe("12k");
    expect(formatTokens(1_250_000)).toBe("1.3m");
  });
});

describe("pluralize", () => {
  test("agrees with its count", () => {
    expect(pluralize(1, "file")).toBe("1 file");
    expect(pluralize(3, "file")).toBe("3 files");
  });
});
