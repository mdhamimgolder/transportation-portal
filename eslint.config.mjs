import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "next-env.d.ts",
    "tsconfig.tsbuildinfo",
    "frontend/**",
    "_archived-fastapi-scaffold-2026-07-27/**",
  ]),
]);

export default eslintConfig;