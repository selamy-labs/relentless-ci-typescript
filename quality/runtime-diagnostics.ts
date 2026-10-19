import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readJson } from "./json-file.js";
import { testSources, verifyInventory } from "./test-inventory.js";

const text = z.string().min(1);
const testCase = z.strictObject({
  id: text,
  file: text,
  name: text,
  retry: z.literal(0),
  repeats: z.literal(0),
  fails: z.literal(false),
  mode: z.literal("run"),
  retryCount: z.literal(0),
  repeatCount: z.literal(0),
});
const receipt = z.strictObject({
  reason: z.literal("passed"),
  unhandledErrors: z.literal(0),
  configuration: z.strictObject({
    retry: z.literal(0),
    allowOnly: z.literal(false),
  }),
  files: z.array(z.string().min(1)).min(1),
  cases: z.array(testCase).min(1),
});

export function diagnosticsPath(root: string): string {
  return join(root, ".quality-results", "diagnostics.json");
}

export function prepareDiagnostics(root: string): void {
  mkdirSync(join(root, ".quality-results"), { recursive: true });
  rmSync(diagnosticsPath(root), { force: true });
}

export function verifyDiagnostics(
  value: unknown,
  expected: string[],
  root: string,
  expectedCount: number,
): void {
  const result = receipt.parse(value);
  const ids = new Set(result.cases.map((test) => test.id));
  if (result.cases.length !== expectedCount || ids.size !== expectedCount) {
    throw new Error("diagnostic cases disagree with completed tests");
  }
  verifyInventory(result.files, expected, root);
  verifyInventory(
    [...new Set(result.cases.map((test) => test.file))],
    expected,
    root,
  );
}

export function verifyRuntimeDiagnostics(
  root: string,
  sources: string[],
  expectedCount: number,
): void {
  verifyDiagnostics(
    readJson(diagnosticsPath(root)),
    testSources(root, sources),
    root,
    expectedCount,
  );
}
