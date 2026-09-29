import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readJson } from "./security.js";
import { testSources, verifyInventory } from "./test-inventory.js";

const receipt = z.strictObject({
  reason: z.literal("passed"),
  unhandledErrors: z.literal(0),
  files: z.array(z.string().min(1)).min(1),
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
): void {
  const result = receipt.parse(value);
  verifyInventory(result.files, expected, root);
}

export function verifyRuntimeDiagnostics(
  root: string,
  sources: string[],
): void {
  verifyDiagnostics(
    readJson(diagnosticsPath(root)),
    testSources(root, sources),
    root,
  );
}
