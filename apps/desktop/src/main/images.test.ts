import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectImage } from "./images.ts";

test("loads project PNG paths and rejects files outside the project", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nativepi-images-"));
  try {
    const project = join(dir, "project");
    await mkdir(project);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const image = join(project, "中文 image.png");
    await writeFile(image, png);
    const expected = `data:image/png;base64,${png.toString("base64")}`;
    expect(await readProjectImage(project, "中文 image.png")).toBe(expected);
    expect(await readProjectImage(project, image)).toBe(expected);
    expect(await readProjectImage(project, pathToFileURL(image).href)).toBe(expected);
    await writeFile(join(dir, "outside.png"), png);
    await expect(readProjectImage(project, "../outside.png")).rejects.toThrow("inside the project");
    await writeFile(join(project, "secret.txt"), "private");
    await expect(readProjectImage(project, "secret.txt")).rejects.toThrow("Unsupported image format");
    await expect(readProjectImage(project, "missing.png")).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
