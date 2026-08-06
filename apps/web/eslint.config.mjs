import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".design-sync/**",
    ".ds-sync/**",
    ".next/**",
    "ds-bundle/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
