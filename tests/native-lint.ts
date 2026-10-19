import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { ESLint } from "eslint";

// In-process ESLint imports eslint.config.mjs natively, and Vitest remaps that
// script's V8 offsets against its own transform, corrupting branch counts. A
// child process discovers and applies the configuration exactly as lint does.
export function nativeLint(
  source: string,
  filePath: string,
  ...options: string[]
): ESLint.LintResult[] {
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/eslint/bin/eslint.js"),
      "--format",
      "json",
      "--stdin",
      "--stdin-filename",
      filePath,
      ...options,
    ],
    { encoding: "utf8", input: source },
  );
  return JSON.parse(result.stdout) as ESLint.LintResult[];
}
