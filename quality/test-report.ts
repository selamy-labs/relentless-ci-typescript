import { mkdirSync, realpathSync, rmSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { readJson } from "./security.js";

const text = z.string().min(1);
const positive = z.number().int().positive();
const passed = z.object({
  status: z.literal("passed"),
  fullName: text,
  failureMessages: z.array(z.unknown()).max(0),
});
const suite = z.object({
  status: z.literal("passed"),
  name: text,
  message: z.literal(""),
  assertionResults: z.array(passed).min(1),
});
const report = z.object({
  success: z.literal(true),
  numTotalTests: positive,
  numPassedTests: positive,
  numFailedTests: z.literal(0),
  numPendingTests: z.literal(0),
  numTodoTests: z.literal(0),
  numTotalTestSuites: positive,
  numPassedTestSuites: positive,
  numFailedTestSuites: z.literal(0),
  numPendingTestSuites: z.literal(0),
  testResults: z.array(suite).min(1),
});

function file(root: string): string {
  return join(root, ".quality-results", "tests.json");
}

export function prepareTests(root: string): void {
  mkdirSync(join(root, ".quality-results"), { recursive: true });
  rmSync(file(root), { force: true });
}

function inventory(paths: string[]): string {
  if (new Set(paths).size !== paths.length) {
    throw new Error("duplicate test suite paths");
  }
  return JSON.stringify([...paths].sort());
}

export function verifyTestReport(
  value: unknown,
  expected: string[],
  root: string,
): void {
  const result = report.parse(value);
  const actual = result.testResults.map((item) =>
    realpathSync(resolve(root, item.name)),
  );
  if (
    inventory(actual) !==
    inventory(expected.map((name) => realpathSync(resolve(root, name))))
  ) {
    throw new Error("test suite inventory is incomplete");
  }
  const count = result.testResults.reduce(
    (total, item) => total + item.assertionResults.length,
    0,
  );
  if (result.numTotalTests !== count || result.numPassedTests !== count) {
    throw new Error("test counts disagree with completed results");
  }
  if (result.numTotalTestSuites < result.testResults.length) {
    throw new Error("suite summary omits test files");
  }
  if (result.numTotalTestSuites !== result.numPassedTestSuites) {
    throw new Error("suite summary is incomplete");
  }
}

export function verifyTests(root: string, sources: string[]): void {
  const expected = sources.filter((path) =>
    /^tests\/.*\.test\.ts$/u.test(relative(root, path).split(sep).join("/")),
  );
  verifyTestReport(readJson(file(root)), expected, root);
}
