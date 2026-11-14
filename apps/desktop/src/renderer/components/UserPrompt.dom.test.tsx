import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import UserPrompt from "./UserPrompt.tsx";
import { CHIP_CLASS } from "../lib/composerChips.ts";

test("sent prompts preserve literal formatting and chip order with composer styles", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<UserPrompt text={'# Keep **this**\n\nUse /skill:choreograph with @"docs/design notes.md".'} />);
  expect(host.textContent).toBe('# Keep **this**\n\nUse choreograph with design notes.md.');
  expect(host.querySelector("p,h1,strong")).toBeNull();
  expect(host.querySelector("[data-reference-source='/skill:choreograph']")?.className).toBe(CHIP_CLASS.skill);
  expect(host.querySelector('[data-reference-source=\'@"docs/design notes.md"\']')?.className).toBe(CHIP_CLASS.file);
});
