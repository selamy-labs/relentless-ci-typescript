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
import { readJson } from "../quality/json-file.js";
import type {
  DiagnosticModule,
  DiagnosticTest,
} from "../quality/test-diagnostics.js";

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
  return {
    reason: "passed",
    unhandledErrors: 0,
    configuration: { retry: 0, allowOnly: false },
    files: [...expected],
    cases: expected.map((file) => recordedCase(file)),
  };
}

function recordedCase(file: string, identity = file) {
  return {
    id: identity,
    file,
    name: identity,
    retry: 0,
    repeats: 0,
    fails: false,
    mode: "run",
    retryCount: 0,
    repeatCount: 0,
  };
}

function observedTest(name: string): DiagnosticTest {
  return {
    id: name,
    fullName: name,
    options: { retry: 0, repeats: undefined, fails: undefined, mode: "run" },
    diagnostic: () => ({ retryCount: 0, repeatCount: 0 }),
  };
}

function observedModule(root: string, name: string): DiagnosticModule {
  return {
    moduleId: join(root, name),
    children: { allTests: () => [observedTest(name)] },
  };
}

test("native reporter init deletes old evidence and end records actual errors and files", () => {
  const root = repository();
  prepareDiagnostics(root);
  writeFileSync(diagnosticsPath(root), "stale");
  const reporter = new DiagnosticsReporter();
  reporter.onInit({ config: { root, retry: 0, allowOnly: false } });
  expect(existsSync(diagnosticsPath(root))).toBe(false);
  const modules = expected.map((name) => observedModule(root, name));
  const expectedReceipt = {
    ...clean(),
    files: expected.map((name) => join(root, name)),
    cases: expected.map((name) => recordedCase(join(root, name), name)),
  };
  reporter.onTestRunEnd(modules, [], "passed");
  expect(readJson(diagnosticsPath(root))).toEqual(expectedReceipt);
  verifyRuntimeDiagnostics(
    root,
    modules.map((module) => module.moduleId),
    2,
  );
  for (const record of [
    { errors: [new Error("one"), new Error("two")], reason: "passed" as const },
    { errors: [], reason: "interrupted" as const },
  ]) {
    reporter.onTestRunEnd(modules, record.errors, record.reason);
    expect(readJson(diagnosticsPath(root))).toEqual({
      ...expectedReceipt,
      reason: record.reason,
      unhandledErrors: record.errors.length,
    });
    expect(() => {
      verifyRuntimeDiagnostics(
        root,
        modules.map((module) => module.moduleId),
        2,
      );
    }).toThrow();
  }
  reporter.onInit({ config: { root, retry: 0, allowOnly: false } });
  expect(existsSync(diagnosticsPath(root))).toBe(false);
});

test("an uninitialized reporter fails before writing", () => {
  expect(() => {
    new DiagnosticsReporter().onTestRunEnd([], [], "passed");
  }).toThrow("not initialized");
});

test("reporter preserves nonzero native options and execution counts", () => {
  const root = repository();
  const reporter = new DiagnosticsReporter();
  reporter.onInit({ config: { root, retry: 4, allowOnly: true } });
  const observed: DiagnosticTest = {
    id: "retried-case",
    fullName: "suite > retried case",
    options: { retry: 2, repeats: 3, fails: true, mode: "skip" },
    diagnostic: () => ({ retryCount: 1, repeatCount: 2 }),
  };
  const file = join(root, expected[0]);
  reporter.onTestRunEnd(
    [{ moduleId: file, children: { allTests: () => [observed] } }],
    [],
    "passed",
  );
  expect(readJson(diagnosticsPath(root))).toEqual({
    reason: "passed",
    unhandledErrors: 0,
    configuration: { retry: 4, allowOnly: true },
    files: [file],
    cases: [
      {
        id: "retried-case",
        file,
        name: "suite > retried case",
        retry: 2,
        repeats: 3,
        fails: true,
        mode: "skip",
        retryCount: 1,
        repeatCount: 2,
      },
    ],
  });
});

test("missing native attempt or root configuration evidence cannot become zero", () => {
  const root = repository();
  const reporter = new DiagnosticsReporter();
  const modules = expected.map((name) => observedModule(root, name));
  reporter.onInit({ config: { root } });
  reporter.onTestRunEnd(modules, [], "passed");
  expect(() => {
    verifyRuntimeDiagnostics(
      root,
      modules.map((item) => item.moduleId),
      2,
    );
  }).toThrow();

  reporter.onInit({ config: { root, retry: 0, allowOnly: false } });
  reporter.onTestRunEnd(
    [
      {
        moduleId: join(root, expected[0]),
        children: {
          allTests: () => [
            { ...observedTest(expected[0]), diagnostic: () => undefined },
          ],
        },
      },
      observedModule(root, expected[1]),
    ],
    [],
    "passed",
  );
  expect(() => {
    verifyRuntimeDiagnostics(
      root,
      modules.map((item) => item.moduleId),
      2,
    );
  }).toThrow();
});

test.each([
  ["retry", 1],
  ["repeats", 1],
  ["fails", true],
  ["mode", "skip"],
  ["mode", "only"],
  ["mode", "todo"],
  ["retryCount", 1],
  ["repeatCount", 1],
  ["id", ""],
  ["name", ""],
  ["file", ""],
])("invalid native case field %s=%j fails", (field, value) => {
  const report = {
    ...clean(),
    cases: [
      { ...recordedCase(expected[0]), [field]: value },
      recordedCase(expected[1]),
    ],
  };
  expect(() => {
    verifyDiagnostics(report, expected, repository(), 2);
  }).toThrow();
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
  { ...clean(), configuration: { retry: 1, allowOnly: false } },
  { ...clean(), configuration: { retry: 0, allowOnly: true } },
  { ...clean(), configuration: {} },
  { ...clean(), cases: [] },
  { ...clean(), cases: [recordedCase(expected[0])] },
  {
    ...clean(),
    cases: [
      recordedCase(expected[0], "same"),
      recordedCase(expected[1], "same"),
    ],
  },
  {
    ...clean(),
    cases: [recordedCase(expected[0]), recordedCase("tests/absent.test.ts")],
  },
  { ...clean(), extra: true },
])("malformed or error-bearing diagnostics fail %j", (value) => {
  expect(() => {
    verifyDiagnostics(value, expected, repository(), 2);
  }).toThrow();
});

test("complete canonical inventories accept order and reject missing or duplicate files", () => {
  const root = repository();
  verifyDiagnostics(
    { ...clean(), files: [...expected].reverse() },
    expected,
    root,
    2,
  );
  for (const files of [
    [expected[0]],
    [...expected, expected[0]],
    ["tests/absent.test.ts"],
    [],
  ]) {
    expect(() => {
      verifyDiagnostics({ ...clean(), files }, expected, root, 2);
    }).toThrow();
  }
  expect(() => {
    verifyDiagnostics(clean(), [...expected, expected[0]], root, 2);
  }).toThrow("duplicate");
  expect(() => {
    verifyDiagnostics(clean(), [expected[0]], root, 2);
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
    verifyRuntimeDiagnostics(root, sources, 2);
  }).toThrow();
  prepareDiagnostics(root);
  writeFileSync(diagnosticsPath(root), "broken JSON");
  expect(() => {
    verifyRuntimeDiagnostics(root, sources, 2);
  }).toThrow();
  writeFileSync(diagnosticsPath(root), JSON.stringify(clean()));
  verifyRuntimeDiagnostics(root, sources, 2);
  prepareDiagnostics(root);
  expect(existsSync(diagnosticsPath(root))).toBe(false);
  expect(() => {
    verifyRuntimeDiagnostics(root, sources, 2);
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
