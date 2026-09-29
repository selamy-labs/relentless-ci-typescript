import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import DiagnosticsReporter from "../quality/diagnostics-reporter.js";
import {
  diagnosticsPath,
  prepareDiagnostics,
  verifyDiagnostics,
  verifyRuntimeDiagnostics,
} from "../quality/runtime-diagnostics.js";
import { readJson } from "../quality/security.js";

const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-diagnostics-"));
  roots.push(root);
  mkdirSync(join(root, "tests"));
  for (const name of ["first.test.ts", "second.test.ts"])
    writeFileSync(join(root, "tests", name), "");
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const expected: [string, string] = [
  "tests/first.test.ts",
  "tests/second.test.ts",
];
function clean() {
  return { reason: "passed", unhandledErrors: 0, files: [...expected] };
}

test("native reporter init deletes old evidence and end records actual errors and files", () => {
  const root = repository();
  prepareDiagnostics(root);
  writeFileSync(diagnosticsPath(root), "stale");
  const reporter = new DiagnosticsReporter();
  reporter.onInit({ config: { root } });
  expect(existsSync(diagnosticsPath(root))).toBe(false);
  const modules = expected.map((name) => ({ moduleId: join(root, name) }));
  reporter.onTestRunEnd(modules, [], "passed");
  expect(readJson(diagnosticsPath(root))).toEqual({
    reason: "passed",
    unhandledErrors: 0,
    files: expected.map((name) => join(root, name)),
  });
  verifyRuntimeDiagnostics(
    root,
    modules.map((module) => module.moduleId),
  );
  for (const record of [
    { errors: [new Error("one"), new Error("two")], reason: "passed" as const },
    { errors: [], reason: "interrupted" as const },
  ]) {
    reporter.onTestRunEnd(modules, record.errors, record.reason);
    expect(readJson(diagnosticsPath(root))).toEqual({
      reason: record.reason,
      unhandledErrors: record.errors.length,
      files: expected.map((name) => join(root, name)),
    });
    expect(() => {
      verifyRuntimeDiagnostics(
        root,
        modules.map((module) => module.moduleId),
      );
    }).toThrow();
  }
  reporter.onInit({ config: { root } });
  expect(existsSync(diagnosticsPath(root))).toBe(false);
});

test("an uninitialized reporter fails before writing", () => {
  expect(() => {
    new DiagnosticsReporter().onTestRunEnd([], [], "passed");
  }).toThrow("not initialized");
});

test.each([
  null,
  {},
  [],
  { ...clean(), reason: "failed" },
  { ...clean(), reason: "interrupted" },
  { ...clean(), unhandledErrors: 1 },
  { ...clean(), unhandledErrors: -1 },
  { ...clean(), unhandledErrors: "0" },
  { ...clean(), files: [] },
  { ...clean(), files: [""] },
  { ...clean(), files: [1] },
  { ...clean(), extra: true },
])("malformed or error-bearing diagnostics fail %j", (value) => {
  expect(() => {
    verifyDiagnostics(value, expected, repository());
  }).toThrow();
});

test("complete canonical inventories accept order and reject missing or duplicate files", () => {
  const root = repository();
  verifyDiagnostics(
    { ...clean(), files: [...expected].reverse() },
    expected,
    root,
  );
  for (const files of [
    [expected[0]],
    [...expected, expected[0]],
    ["tests/absent.test.ts"],
    [],
  ]) {
    expect(() => {
      verifyDiagnostics({ ...clean(), files }, expected, root);
    }).toThrow();
  }
  expect(() => {
    verifyDiagnostics(clean(), [...expected, expected[0]], root);
  }).toThrow("duplicate");
  expect(() => {
    verifyDiagnostics(clean(), [expected[0]], root);
  }).toThrow("incomplete");
});

test("receipt verification uses enrolled tests and fails missing, stale or corrupted output", () => {
  const root = repository();
  const sources = [
    ...expected,
    "tests/setup.ts",
    "src/example.test.ts",
    "quality/example.test.ts",
    "tests/hidden.test.ts.helper.ts",
  ].map((name) => join(root, name));
  expect(() => {
    verifyRuntimeDiagnostics(root, sources);
  }).toThrow();
  prepareDiagnostics(root);
  writeFileSync(diagnosticsPath(root), "broken JSON");
  expect(() => {
    verifyRuntimeDiagnostics(root, sources);
  }).toThrow();
  writeFileSync(diagnosticsPath(root), JSON.stringify(clean()));
  verifyRuntimeDiagnostics(root, sources);
  prepareDiagnostics(root);
  expect(existsSync(diagnosticsPath(root))).toBe(false);
  expect(() => {
    verifyRuntimeDiagnostics(root, sources);
  }).toThrow();
});

test.each(["", ".", "relative/path"])(
  "reporter rejects an invalid root %s",
  (root) => {
    const reporter = new DiagnosticsReporter();
    expect(() => {
      reporter.onInit({ config: { root } });
    }).toThrow("must be absolute");
    expect(() => {
      reporter.onTestRunEnd([], [], "passed");
    }).toThrow("not initialized");
  },
);
