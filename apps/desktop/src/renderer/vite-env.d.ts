/// <reference types="vite/client" />

// The icon theme's manifest, typed by hand: it is a 450 kB JSON file, and the
// three maps below are all this app reads out of it.
declare module "material-icon-theme/dist/material-icons.json" {
  const manifest: {
    iconDefinitions: Record<string, { iconPath: string }>;
    fileNames: Record<string, string>;
    fileExtensions: Record<string, string>;
  };
  export default manifest;
}
