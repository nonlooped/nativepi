import { describe, expect, test } from "bun:test";
import { formatDuration, formatElapsed, formatLineDelta, formatTokens, timeAgo } from "./format.ts";

describe("formatElapsed", () => {
  test("steps from seconds to hours", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(47_000)).toBe("47s");
    expect(formatElapsed(133_000)).toBe("2m 13s");
    expect(formatElapsed(120_000)).toBe("2m");
    expect(formatElapsed(3_840_000)).toBe("1h 4m");
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
    expect(formatTokens(12_400)).toBe("12K");
    expect(formatTokens(1_250_000)).toBe("1.3M");
    expect(formatTokens(2_000_000)).toBe("2M");
  });
});

describe("timeAgo", () => {
  const NOW = new Date(2026, 6, 30, 12).getTime();
  const daysBefore = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

  test("climbs through the units", () => {
    expect(timeAgo(new Date(NOW - 30_000).toISOString(), NOW)).toBe("now");
    expect(timeAgo(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe("20m");
    expect(timeAgo(new Date(NOW - 5 * 3_600_000).toISOString(), NOW)).toBe("5h");
    expect(timeAgo(daysBefore(3), NOW)).toBe("3d");
    expect(timeAgo(daysBefore(20), NOW)).toBe("2w");
    expect(timeAgo(daysBefore(90), NOW)).toBe("3mo");
    expect(timeAgo(daysBefore(400), NOW)).toBe("1y");
  });

  test("never reports a chat under a year old as zero years", () => {
    // 360 days used to round to twelve months and then fall through to "0y".
    for (const days of [340, 355, 360, 364]) {
      expect(timeAgo(daysBefore(days), NOW)).toBe("11mo");
    }
    expect(timeAgo(daysBefore(365), NOW)).toBe("1y");
  });
});
