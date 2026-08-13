import { describe, expect, test } from "bun:test";
import { workspaceLayoutFor } from "./layout.ts";

describe("workspaceLayoutFor", () => {
  test("sheets both panes on a phone-width viewport", () => {
    expect(workspaceLayoutFor(320)).toBe("compact");
    expect(workspaceLayoutFor(390)).toBe("compact");
    expect(workspaceLayoutFor(639)).toBe("compact");
  });

  test("docks the project sidebar on a tablet or a minimum desktop window", () => {
    expect(workspaceLayoutFor(640)).toBe("narrow");
    expect(workspaceLayoutFor(768)).toBe("narrow");
    expect(workspaceLayoutFor(720)).toBe("narrow");
    expect(workspaceLayoutFor(1099)).toBe("narrow");
  });

  test("docks both panes on a wide desktop window", () => {
    expect(workspaceLayoutFor(1100)).toBe("wide");
    expect(workspaceLayoutFor(1440)).toBe("wide");
  });
});
