import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  diagnosticsPath,
  verifyDiagnostics,
} from "../quality/runtime-diagnostics.js";
import { readJson } from "../quality/security.js";
import { verifyTestReport } from "../quality/test-report.js";

const roots: string[] = [];
function nativeRun(body: string, ignore = false) {
  const root = mkdtempSync(join(tmpdir(), "relentless-runtime-"));
  roots.push(root);
  mkdirSync(join(root, "tests"));
  const fixture = join(root, "tests", "fixture.test.mjs");
  writeFileSync(
    fixture,
    `import { test, expect } from 'vitest';\ntest('native case', async () => { ${body}; expect(1).toBe(1); });\n`,
  );
  const config = {
    resolve: {
      alias: { vitest: resolve("node_modules/vitest/dist/index.js") },
    },
    test: {
      include: ["tests/**/*.test.mjs"],
      setupFiles: [resolve("tests/runtime-setup.ts")],
      reporters: ["json", resolve("quality/diagnostics-reporter.ts")],
      outputFile: join(root, "tests.json"),
      dangerouslyIgnoreUnhandledErrors: ignore,
      allowOnly: false,
      passWithNoTests: false,
      retry: 0,
      maxWorkers: 1,
    },
  };
  const configuration = join(root, "vitest.config.mjs");
  writeFileSync(configuration, `export default ${JSON.stringify(config)};\n`);
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/vitest/vitest.mjs"),
      "run",
      "--root",
      root,
      "--config",
      configuration,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, CI: "", GITHUB_ACTIONS: "" },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return { root, fixture, result };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("native guarded tests generate independent clean diagnostic evidence", () => {
  const { root, fixture, result } = nativeRun("await Promise.resolve()");
  expect(result.status, result.stderr).toBe(0);
  verifyTestReport(readJson(join(root, "tests.json")), [fixture], root);
  verifyDiagnostics(readJson(diagnosticsPath(root)), [fixture], root);
});

test.each([
  "process.emitWarning('runtime diagnostic')",
  "process.emitWarning('deprecated', 'DeprecationWarning')",
  "void Promise.reject(new Error('unhandled rejection')); await new Promise(r => setTimeout(r, 10))",
  "setTimeout(() => { throw new Error('uncaught exception'); }, 0); await new Promise(r => setTimeout(r, 10))",
])(
  "native diagnostics fail despite a successful JSON test report: %s",
  (body) => {
    const { root, fixture, result } = nativeRun(body);
    expect(result.status, result.stderr).toBe(1);
    verifyTestReport(readJson(join(root, "tests.json")), [fixture], root);
    expect(() => {
      verifyDiagnostics(readJson(diagnosticsPath(root)), [fixture], root);
    }).toThrow();
  },
);

test("the independent receipt rejects the native zero-exit ignored-error bypass", () => {
  const { root, fixture, result } = nativeRun(
    "process.emitWarning('ignored bypass')",
    true,
  );
  expect(result.status, result.stderr).toBe(0);
  verifyTestReport(readJson(join(root, "tests.json")), [fixture], root);
  expect(readJson(diagnosticsPath(root))).toEqual({
    reason: "passed",
    unhandledErrors: 1,
    files: [fixture],
  });
  expect(() => {
    verifyDiagnostics(readJson(diagnosticsPath(root)), [fixture], root);
  }).toThrow();
});
