import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { InlineConfig } from "vitest/node";
import {
  diagnosticsPath,
  verifyDiagnostics,
} from "../quality/runtime-diagnostics.js";
import { readJson } from "../quality/json-file.js";
import { verifyTestReport } from "../quality/test-report.js";

const roots: string[] = [];

function rejectDiagnostics(root: string, fixture: string): void {
  expect(() => {
    verifyDiagnostics(readJson(diagnosticsPath(root)), [fixture], root, 1);
  }).toThrow();
}
function nativeRun(body: string, ignore = false) {
  return nativeProgram(
    `import { test, expect } from 'vitest';\ntest('native case', async () => { ${body}; expect(1).toBe(1); });\n`,
    { dangerouslyIgnoreUnhandledErrors: ignore },
  );
}

function nativeProgram(source: string, options: InlineConfig = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "relentless-runtime-")));
  roots.push(root);
  mkdirSync(join(root, "tests"));
  const fixture = join(root, "tests", "fixture.test.mjs");
  writeFileSync(fixture, source);
  const config = {
    resolve: {
      alias: { vitest: resolve("node_modules/vitest/dist/index.js") },
    },
    test: {
      include: ["tests/**/*.test.mjs"],
      setupFiles: [resolve("tests/runtime-setup.ts")],
      reporters: ["json", resolve("quality/diagnostics-reporter.ts")],
      outputFile: join(root, "tests.json"),
      dangerouslyIgnoreUnhandledErrors: false,
      allowOnly: false,
      passWithNoTests: false,
      retry: 0,
      maxWorkers: 1,
      ...options,
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

test.each([
  [
    "unused retry allowance",
    'test("case", { retry: 1 }, () => { expect(1).toBe(1); });',
    0,
  ],
  [
    "repetitions",
    'test("case", { repeats: 1 }, () => { expect(1).toBe(1); });',
    0,
  ],
  [
    "expected failure",
    'test.fails("case", () => { throw new Error("expected"); });',
    0,
  ],
  [
    "inherited suite retry",
    'describe("suite", { retry: 1 }, () => { test("case", () => { expect(1).toBe(1); }); });',
    0,
  ],
  ["global retry", 'test("case", () => { expect(1).toBe(1); });', 1],
  [
    "overridden global retry",
    'test("case", { retry: 0 }, () => { expect(1).toBe(1); });',
    1,
  ],
])(
  "native diagnostics reject %s despite green final results",
  (_name, source, retry) => {
    const { root, fixture, result } = nativeProgram(
      `import { test, expect, describe } from 'vitest';\n${source}\n`,
      { retry },
    );
    expect(result.status, result.stderr).toBe(0);
    verifyTestReport(readJson(join(root, "tests.json")), [fixture], root);
    rejectDiagnostics(root, fixture);
  },
  30_000,
);

test("native retry history and attempt diagnostics independently reject fail-then-pass", () => {
  const { root, fixture, result } = nativeProgram(
    'import { test, expect } from "vitest"; let count = 0; test("case", { retry: 1 }, () => { expect(++count).toBe(2); });',
  );
  expect(result.status, result.stderr).toBe(0);
  const report = readJson(join(root, "tests.json"));
  expect(report).toMatchObject({ success: true, numFailedTests: 0 });
  expect(() => verifyTestReport(report, [fixture], root)).toThrow();
  rejectDiagnostics(root, fixture);
}, 30_000);

test("native guarded tests generate independent clean diagnostic evidence", () => {
  const { root, fixture, result } = nativeRun("await Promise.resolve()");
  expect(result.status, result.stderr).toBe(0);
  verifyTestReport(readJson(join(root, "tests.json")), [fixture], root);
  verifyDiagnostics(readJson(diagnosticsPath(root)), [fixture], root, 1);
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
    rejectDiagnostics(root, fixture);
  },
);

test("the independent receipt rejects the native zero-exit ignored-error bypass", () => {
  const { root, fixture, result } = nativeRun(
    "process.emitWarning('ignored bypass')",
    true,
  );
  expect(result.status, result.stderr).toBe(0);
  verifyTestReport(readJson(join(root, "tests.json")), [fixture], root);
  expect(readJson(diagnosticsPath(root))).toMatchObject({
    reason: "passed",
    unhandledErrors: 1,
    files: [fixture],
  });
  rejectDiagnostics(root, fixture);
});
