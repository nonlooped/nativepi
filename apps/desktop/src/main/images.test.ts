import { expect, test } from "bun:test";
import { mkdtemp, mkdir, open, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectImage } from "./images.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

async function withProject(run: (project: string, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "nativepi-images-"));
  try {
    const project = join(dir, "project");
    await mkdir(project);
    await run(project, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("loads relative, absolute and file URL image paths with Unicode and spaces", async () => {
  await withProject(async (project, dir) => {
    const name = "中文 image #1.PNG";
    const image = join(project, name);
    await writeFile(image, png);
    const expected = `data:image/png;base64,${png.toString("base64")}`;
    for (const path of [name, `./${name}`, image, pathToFileURL(image).href]) {
      expect(await readProjectImage(project, path)).toBe(expected);
    }
    const alias = join(dir, "project-link");
    await symlink(project, alias, "junction");
    expect(await readProjectImage(alias, name)).toBe(expected);
  });
});

test("rejects traversal, sibling prefixes, symlink escapes and nonlocal URLs", async () => {
  await withProject(async (project, dir) => {
    const outside = join(dir, "project-neighbor");
    await mkdir(outside);
    const image = join(outside, "private.png");
    await writeFile(image, png);
    await symlink(outside, join(project, "escape"), "junction");
    for (const file of ["../project-neighbor/private.png", image, pathToFileURL(image).href, "escape/private.png"]) {
      await expect(readProjectImage(project, file)).rejects.toThrow("inside the project");
    }
    for (const file of ["https://example.com/image.png", "javascript:alert(1)", "file://server/share/image.png", "\\\\server\\share\\image.png"]) {
      await expect(readProjectImage(project, file)).rejects.toThrow("local image path");
    }
  });
});

test("rejects unsupported formats, missing files, directories and images over 16 MiB", async () => {
  await withProject(async (project) => {
    for (const name of ["private.txt", "active.svg", "image.bmp"]) {
      await writeFile(join(project, name), "not a raster image");
      await expect(readProjectImage(project, name)).rejects.toThrow("Unsupported image format");
    }
    await expect(readProjectImage(project, "missing.png")).rejects.toThrow();
    await mkdir(join(project, "folder.png"));
    await expect(readProjectImage(project, "folder.png")).rejects.toThrow("not a file");
    const large = await open(join(project, "large.png"), "w");
    try { await large.truncate(16 * 1024 * 1024 + 1); } finally { await large.close(); }
    await expect(readProjectImage(project, "large.png")).rejects.toThrow("too large");
  });
});
