import { expect, test } from "bun:test";
import { loadProjectIcon, projectIconCandidates } from "./projectIcons.ts";

test("prefers conventional favicons and searches nested app assets deterministically", () => {
  expect(projectIconCandidates(["resources/icon.png", "apps/web/public/favicon.ico", "favicon.svg", "assets/logo.svg"]))
    .toEqual(["favicon.svg", "apps/web/public/favicon.ico", "resources/icon.png", "assets/logo.svg"]);
});
test("does not pick dependency, generated, or fixture images, or arbitrary photos", () => {
  expect(projectIconCandidates(["node_modules/foo/favicon.ico", "dist/icon.png", "tests/fixtures/favicon.svg", "public/photo.png", "vendor/logo.png"]))
    .toEqual([]);
});
test("normalizes Windows separators for ranking and limits the number of reads", () => {
  expect(projectIconCandidates(["public\\favicon.ico", "assets/icon-192.png"])[0]).toBe("public\\favicon.ico");
  expect(projectIconCandidates(Array.from({length:20}, (_,i)=>`apps/app${i}/favicon.ico`)).length).toBe(6);
});
test("tries the next icon when a candidate is unreadable, oversized, or unavailable", async () => {
  const seen: string[]=[];
  const src=await loadProjectIcon(["favicon.svg", "favicon.ico", "icon.png", "logo.png"], async file=>{
    seen.push(file);
    if(file==='favicon.ico')throw Error('unreadable');
    if(file==='favicon.svg')return {src:'x'.repeat(1_000_001)};
    if(file==='icon.png')return {};
    return {src:'data:image/png;base64,ok'};
  });
  expect(seen).toEqual(["favicon.ico", "favicon.svg", "icon.png", "logo.png"]);
  expect(src).toBe('data:image/png;base64,ok');
});
test("missing icons leave the letter fallback available", async () => {
  expect(await loadProjectIcon([], async()=>{throw Error('must not read')})).toBeUndefined();
});
