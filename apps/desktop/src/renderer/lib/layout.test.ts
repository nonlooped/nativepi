import { describe, expect, test } from "bun:test";
import { workspaceLayoutFor } from "./layout.ts";

describe("workspaceLayoutFor", () => {
  test("scales the layout with the display's available width", () => {
    // One display is enough to check each range; the separate cases below
    // exercise exact boundaries and adaptation to a different display.
    expect(workspaceLayoutFor(768, 1920)).toBe("compact");
    expect(workspaceLayoutFor(1152, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1728, 1920)).toBe("wide");
  });

  test("uses relative boundaries for both sidebars", () => {
    expect(workspaceLayoutFor(864, 1920)).toBe("compact");
    expect(workspaceLayoutFor(865, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1440, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1441, 1920)).toBe("wide");
  });

  test("full-screen phones stay compact and small displays cannot dock both panes", () => {
    expect(workspaceLayoutFor(390, 390)).toBe("compact");
    expect(workspaceLayoutFor(767, 767)).toBe("compact");
    expect(workspaceLayoutFor(768, 768)).toBe("narrow");
    expect(workspaceLayoutFor(1024, 1024)).toBe("narrow");
    expect(workspaceLayoutFor(1099, 1099)).toBe("narrow");
    expect(workspaceLayoutFor(1100, 1100)).toBe("wide");
  });

  test("the same window adapts to different displays", () => {
    expect(workspaceLayoutFor(1200, 1440)).toBe("wide");
    expect(workspaceLayoutFor(1200, 1920)).toBe("narrow");
    expect(workspaceLayoutFor(1200, 3840)).toBe("compact");
  });
});
