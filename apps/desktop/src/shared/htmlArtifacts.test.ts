import { expect, test } from "bun:test";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { ARTIFACT_CSP, artifactFrameMessageSchema, artifactFromDetails, htmlArtifactDocument, visitHtmlElements } from "./htmlArtifacts.ts";

test("policy and bootstrap precede author code even with misleading head tags inside text and comments", () => {
  const document = parse(htmlArtifactDocument('<!-- <head> --><html><head><title>Test</title><script>console.log("author")</script></head><body><p>Visual</p></body></html>', { appearance: "dark", variables: { "--foreground": "#ffffff" } }));
  let head: DefaultTreeAdapterMap["childNode"][] = [];
  visitHtmlElements(document, element => { if (element.tagName === "head") head = element.childNodes; });
  expect(head[0]).toMatchObject({ tagName: "meta", attrs: [{ name: "http-equiv", value: "Content-Security-Policy" }, { name: "content", value: ARTIFACT_CSP }] });
  expect(head.slice(0, 4).map(node => "tagName" in node ? node.tagName : undefined)).toEqual(["meta", "meta", "style", "script"]);
  expect(ARTIFACT_CSP).toContain("connect-src 'none'");
  expect(ARTIFACT_CSP).toContain("frame-src 'none'");
  expect(ARTIFACT_CSP).not.toContain("unsafe-eval");
});

test("theme values cannot inject HTML, script, or extra CSS declarations", () => {
  for (const value of ["red;display:none", "</style><script>alert(1)</script>", "red}body{display:none"]) {
    expect(() => htmlArtifactDocument("<p>Visual</p>", { appearance: "dark", variables: { "--foreground": value } })).toThrow();
  }
});

test("foreign-content head elements cannot capture the document's security policy", () => {
  const html = htmlArtifactDocument('<html><head><title>Safe head</title></head><body><svg><head></head></svg></body></html>', { appearance: "light", variables: {} });
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("Safe head"));
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<svg>"));
});

test("malformed persisted artifacts and hostile frame messages are rejected", () => {
  for (const value of [null, {}, { htmlArtifact: { version: 2, html: "<p>x</p>", title: "x", height: 100 } }, { htmlArtifact: { version: 1, html: "x", title: "x", height: Infinity } }]) {
    expect(artifactFromDetails(value)).toBeUndefined();
  }
  for (const value of [{ type: "nativepi.artifact.size", height: Infinity }, { type: "nativepi.artifact.link", url: "javascript:alert(1)" }, { type: "nativepi.artifact.link", url: "file:///secret" }]) {
    expect(artifactFrameMessageSchema.safeParse(value).success).toBe(false);
  }
  expect(artifactFrameMessageSchema.safeParse({ type: "nativepi.artifact.link", url: "https://example.com" }).success).toBe(true);
});
