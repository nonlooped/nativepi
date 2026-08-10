import { describe, expect, test } from "bun:test";
import { devFreshness } from "./devFreshness.ts";

const marker = {
  generation: "c43f2bd2-faf6-4ca2-bfab-a946c2a00ac8",
  startedAt: 1_773_451_123_000,
  gitHead: "a7c31e4",
  dirty: true,
};

describe("development window freshness", () => {
  test("is current only when renderer, preload, main, and launcher agree", () => {
    expect(devFreshness(marker.generation, marker.generation, {
      development: true,
      mainGeneration: marker.generation,
      expected: marker,
    })).toBe("current");
  });

  test("is stale when a newer launcher generation exists", () => {
    expect(devFreshness("older", "older", {
      development: true,
      mainGeneration: "older",
      expected: marker,
    })).toBe("stale");
  });

  test("is stale when one bundled process is from another generation", () => {
    expect(devFreshness(marker.generation, "older", {
      development: true,
      mainGeneration: marker.generation,
      expected: marker,
    })).toBe("stale");
  });

  test("does not claim freshness without a readable launcher marker", () => {
    expect(devFreshness(marker.generation, marker.generation, {
      development: true,
      mainGeneration: marker.generation,
    })).toBe("unverified");
  });
});
