import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import UserPrompt from "./UserPrompt.tsx";

test("sent prompts preserve literal formatting and ordered reference sources", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<UserPrompt text={'# Keep **this**\n\nUse /skill:choreograph with @"docs/design notes.md".'} />);
  expect(host.textContent).toBe('# Keep **this**\n\nUse choreograph with design notes.md.');
  expect([...host.querySelectorAll("[data-reference-source]")].map(element => element.getAttribute("data-reference-source")))
    .toEqual(["/skill:choreograph", '@"docs/design notes.md"']);
});
