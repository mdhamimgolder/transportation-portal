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
    // Agent scratch / worktrees hold stale *copies* of this repo (they are
    // separate git worktrees, not source) — never lint them.
    ".claude/**",
    ".kilo/**",
    // Legacy FastAPI scaffold + Vite frontend moved to
    // ../Transportation-System-archive/ (kept for history, not part of the app).
    "_archived-fastapi-scaffold-*/**",
    "_archive-*/**",
  ]),
]);

export default eslintConfig;