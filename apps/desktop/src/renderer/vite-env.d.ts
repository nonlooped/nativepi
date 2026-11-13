/// <reference types="vite/client" />

declare module "apca-w3" {
  export function APCAcontrast(textLuminance: number, backgroundLuminance: number): number;
  export function sRGBtoY(rgb: [number, number, number]): number;
}

// The icon theme's manifest, typed by hand: it is a 450 kB JSON file, and the
// fields below are all this app reads out of it.
declare module "material-icon-theme/dist/material-icons.json" {
  const manifest: {
    iconDefinitions: Record<string, { iconPath: string }>;
    fileNames: Record<string, string>;
    fileExtensions: Record<string, string>;
    folder: string;
    folderExpanded: string;
    folderNames: Record<string, string>;
    folderNamesExpanded: Record<string, string>;
  };
  export default manifest;
}
