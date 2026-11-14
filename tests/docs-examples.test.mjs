import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const ts = require("typescript");
const web = resolve(import.meta.dir, "../apps/web");
async function snippets(route) {
  const source = await readFile(join(web, "app/docs", route, "page.tsx"), "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const snippets = [];
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "Code") {
      const values = {};
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property) || !property.initializer)
          continue;
        const value = ts.isJsxExpression(property.initializer) ? property.initializer.expression : property.initializer;
        if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)))
          values[property.name.getText(ast)] = value.text;
      }
      if (values.code)
        snippets.push({ code: values.code, lang: values.lang, filename: values.filename });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return snippets;
}
async function typecheck(files) {
  const directory = await mkdtemp(join(web, ".docs-examples-"));
  try {
    for (const [name, code] of Object.entries(files)) {
      const target = join(directory, name);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, code);
    }
    const program = ts.createProgram(Object.keys(files).map((name) => join(directory, name)), {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      paths: {
        "@nativepi/extension-api": [resolve(web, "../../packages/extension-api/src/index.ts")],
        "@nativepi/extension-api/*": [resolve(web, "../../packages/extension-api/src/*.ts")],
        "@earendil-works/pi-coding-agent": [resolve(web, "../desktop/node_modules/@earendil-works/pi-coding-agent")]
      }
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test("the displayed complete counter example typechecks against the local API", async () => {
  const complete = (await snippets("extension-api/quickstart")).filter((snippet) => snippet.filename?.endsWith(".ts") || snippet.filename?.endsWith(".tsx"));
  expect(complete).toHaveLength(3);
  expect(await typecheck(Object.fromEntries(complete.map((snippet) => [snippet.filename, snippet.code])))).toEqual([]);
});
test("task count and terminal recipe compile with the documented task protocol", async () => {
  const protocol = (await snippets("extension-api/protocols")).find((snippet) => snippet.filename === "src/protocol.ts");
  const recipes = await snippets("extension-api/examples");
  const taskCount = recipes.find((snippet) => snippet.code.startsWith("function TaskCount"));
  const terminal = recipes.find((snippet) => snippet.code.startsWith('pi.registerCommand("tasks"'));
  expect(await typecheck({
    "protocol.ts": protocol.code,
    "renderer.tsx": `import { useEffect, useState } from "react";
import type { RendererContext } from "@nativepi/extension-api";
import { Badge } from "@nativepi/extension-api/ui";
import { taskProtocol } from "./protocol.ts";
${taskCount.code}`,
    "extension.ts": `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { taskProtocol } from "./protocol.ts";
declare const pi: ExtensionAPI;
const tasks: Array<{ id: string; title: string; complete: boolean }> = [];
const host = connect("task-example", taskProtocol, { list: () => tasks, add: ({ title }) => ({ id: "new", title, complete: false }), clear: () => null });
${terminal.code}`
  })).toEqual([]);
});

test("literal internal documentation links resolve to existing routes and anchors", async () => {
  const glob = new Bun.Glob("app/docs/**/page.tsx");
  const pages = new Map();
  for await (const file of glob.scan({ cwd: web })) {
    const route = "/" + file.replace(/\/page\.tsx$/, "").replace(/^app\//, "");
    pages.set(route, await readFile(join(web, file), "utf8"));
  }
  const broken = [];
  const sources = [...pages.values(), await readFile(join(web, "lib/docs.ts"), "utf8")];
  for (const source of sources) {
    for (const match of source.matchAll(/(?:href=|href:\s*)["'](\/docs[^"']*)["']/g)) {
      const [route, anchor] = match[1].split("#");
      const target = pages.get(route);
      if (!target || (anchor && !target.includes(`id="${anchor}"`))) broken.push(match[1]);
    }
  }
  expect(broken).toEqual([]);
});
