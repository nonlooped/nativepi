import { describe, expect, test } from "bun:test";
import { workspaceLayoutFor } from "./layout.ts";

describe("workspaceLayoutFor", () => {
  test("scales the layout with the display's available width", () => {
    for (const displayWidth of [1280, 1440, 1920, 2560, 3840]) {
      expect(workspaceLayoutFor(displayWidth * 0.4, displayWidth)).toBe("compact");
      expect(workspaceLayoutFor(displayWidth * 0.6, displayWidth)).toBe("narrow");
      expect(workspaceLayoutFor(displayWidth * 0.9, displayWidth)).toBe("wide");
      expect(workspaceLayoutFor(displayWidth, displayWidth)).toBe("wide");
    }
  });

  test("uses relative boundaries for both sidebars", () => {
    expect(workspaceLayoutFor(864, 1920)).toBe("compact");
    expect(workspaceLayoutFor(865, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1440, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1441, 1920)).toBe("wide");
  });

  test("the same window adapts to different displays", () => {
    expect(workspaceLayoutFor(1200, 1440)).toBe("wide");
    expect(workspaceLayoutFor(1200, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1200, 3840)).toBe("compact");
  });
});
