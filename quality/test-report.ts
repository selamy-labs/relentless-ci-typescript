import { rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readJson } from "./security.js";
import { prepareDiagnostics } from "./runtime-diagnostics.js";
import { testSources, verifyInventory } from "./test-inventory.js";

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
  prepareDiagnostics(root);
  rmSync(file(root), { force: true });
}

export function verifyTestReport(
  value: unknown,
  expected: string[],
  root: string,
): void {
  const result = report.parse(value);
  verifyInventory(
    result.testResults.map((item) => item.name),
    expected,
    root,
  );
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
  verifyTestReport(readJson(file(root)), testSources(root, sources), root);
}
