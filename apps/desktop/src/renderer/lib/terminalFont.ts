const NERD_FONT = '"JetBrains Mono NL Nerd Font Mono"';
export const TERMINAL_FALLBACK_FONT = "Consolas, 'Cascadia Mono', ui-monospace, monospace";
export const TERMINAL_FONT = `${NERD_FONT}, ${TERMINAL_FALLBACK_FONT}`;

/** xterm measures its grid when the font option changes. Switch only once both weights are ready. */
export async function loadTerminalFont(): Promise<boolean> {
  if (!document.fonts?.load) return false;
  try {
    const regular = document.fonts.load(`400 13px ${NERD_FONT}`);
    const bold = document.fonts.load(`700 13px ${NERD_FONT}`);
    const faces = await Promise.all([regular, bold]);
    return faces.every((matches) => matches.length > 0);
  } catch {
    return false;
  }
}
