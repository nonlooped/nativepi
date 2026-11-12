/** Prefer conventional app icons; ignore dependency, generated, and fixture assets. */
export function projectIconCandidates(files: string[]): string[] {
  return files.flatMap((file) => {
    const parts = file.replaceAll("\\", "/").split("/");
    if (parts.some((part) => /^(?:node_modules|vendor|dist|build|out|coverage|\.git|tests?|__tests__|fixtures?|__fixtures__)$/i.test(part))) return [];
    const name = parts.at(-1)!;
    const match = /^(favicon|icon|logo|apple-touch-icon)(?:[-.](?:dark|light|\d+(?:x\d+)?))?\.(svg|ico|png|webp|jpe?g)$/i.exec(name);
    if (!match) return [];
    const priority = ["favicon", "icon", "logo", "apple-touch-icon"].indexOf(match[1]!.toLowerCase());
    return [{ file, score: priority * 100 + parts.length }];
  }).sort((a, b) => a.score - b.score || a.file.localeCompare(b.file)).slice(0, 6).map(({file}) => file);
}

export async function loadProjectIcon(files: string[], read: (file: string) => Promise<{src?: string}>): Promise<string | undefined> {
  for (const file of projectIconCandidates(files)) {
    try {
      const {src} = await read(file);
      if (src && src.length <= 1_000_000) return src;
    } catch { /* An unreadable candidate must not hide other usable icons. */ }
  }
}
