import { expect, test } from "bun:test";
import { ANNOTATION_PREFIX, annotationToken, browserAnnotationSchema, readAnnotation } from "./browserAnnotation.ts";
import { parseSegments, skillPrompt } from "../renderer/lib/composerText.ts";
const annotation = {
  version: 1 as const, id: "00000000-0000-4000-8000-000000000001", browser: "00000000-0000-4000-8000-000000000002", tab: "00000000-0000-4000-8000-000000000003",
  title: "Checkout", url: "http://localhost:8080/cart", capturedAt: "2026-11-17T00:00:00.000Z",
  element: { selector: "html:nth-of-type(1) > body:nth-of-type(1) > button:nth-of-type(2)", tag: "button", text: "Pay <now>", attributes: { "aria-label": "Pay now", "data-testid": "checkout" } },
};
test("annotations round trip in saved drafts and submit readable exact evidence alongside skills", () => {
  const token = annotationToken(annotation);
  expect(parseSegments(token)).toEqual([{ kind: "browser", value: token.slice(ANNOTATION_PREFIX.length, -1) }]);
  expect(readAnnotation(token.slice(ANNOTATION_PREFIX.length, -1))).toEqual(annotation);
  const sent = skillPrompt(`Please change ${token} /skill:design`);
  expect(sent).toStartWith("/skill:design Please change Browser element");
  expect(sent).toContain(JSON.stringify(annotation, null, 2));
  expect(sent).toContain("not an actionable browser ref");
  expect(sent).not.toContain("[browser-element:");
});
test("malformed, oversized and sensitive-value payloads fail the boundary", () => {
  for (const value of ["%zz", "a".repeat(32001), encodeURIComponent('{}')]) expect(readAnnotation(value)).toBeNull();
  expect(browserAnnotationSchema.safeParse({ ...annotation, element: { ...annotation.element, attributes: { value: "secret" } } }).success).toBe(false);
  expect(browserAnnotationSchema.safeParse({ ...annotation, url: "https://user:password@example.com" }).success).toBe(false);
  expect(browserAnnotationSchema.safeParse({ ...annotation, element: { ...annotation.element, text: "x".repeat(601) } }).success).toBe(false);
  expect(parseSegments("[browser-element:%zz]")).toEqual([{ kind: "text", value: "[browser-element:%zz]" }]);
});

test("the encoded draft budget rejects large Unicode evidence before a chip can be delivered", () => {
  const large = { ...annotation, url: "https://example.com/" + "%20".repeat(2600), element: { ...annotation.element, selector: "界".repeat(2000), text: "界".repeat(600) } };
  expect(browserAnnotationSchema.safeParse(large).success).toBe(false);
  expect(() => annotationToken(large)).toThrow();
});
