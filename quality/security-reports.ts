import { resolve } from "node:path";
import { z } from "zod";

const text = z.string().min(1);
const empty = z.array(z.unknown()).max(0);
const sourceScan = z.object({
  results: empty,
  errors: empty,
  skipped_rules: empty,
  paths: z.object({ scanned: z.array(text) }),
});
const packageRecord = z.object({
  package: z.object({ name: text, version: text, ecosystem: text }),
  vulnerabilities: empty.optional(),
  groups: empty.optional(),
  license_violations: empty.optional(),
});
const audit = z.object({
  errors: empty.optional(),
  results: z.tuple([
    z.object({
      source: z.object({ type: z.literal("lockfile"), path: text }),
      packages: z.array(packageRecord),
    }),
  ]),
});
const lock = z.object({
  lockfileVersion: z.literal(3),
  packages: z.record(
    z.string(),
    z.object({ name: text.optional(), version: text.optional() }),
  ),
});
const modules = "node_modules/";

function inventory(values: string[]): string {
  return JSON.stringify([...new Set(values)].sort());
}

export function verifySast(value: unknown, expected: string[]): void {
  const report = sourceScan.parse(value);
  if (inventory(report.paths.scanned) !== inventory(expected)) {
    throw new Error("static security scan source inventory is incomplete");
  }
}

function lockedPackages(value: unknown): string[] {
  return Object.entries(lock.parse(value).packages)
    .filter(([path]) => path !== "")
    .map(([path, item]) => {
      const name =
        item.name ?? path.slice(path.lastIndexOf(modules) + modules.length);
      return JSON.stringify([
        text.parse(name),
        text.parse(item.version),
        "npm",
      ]);
    });
}

export function verifyAudit(
  value: unknown,
  locked: unknown,
  lockfile: string,
): void {
  const [group] = audit.parse(value).results;
  if (resolve(group.source.path) !== resolve(lockfile)) {
    throw new Error("audit source must be the requested lockfile");
  }
  const actual = group.packages.map(({ package: item }) =>
    JSON.stringify([item.name, item.version, item.ecosystem]),
  );
  if (new Set(actual).size !== actual.length) {
    throw new Error("duplicate package in audit inventory");
  }
  const expected = lockedPackages(locked);
  if (expected.length === 0 || inventory(actual) !== inventory(expected)) {
    throw new Error("dependency audit package inventory is incomplete");
  }
}

export function verifySecrets(value: unknown): void {
  empty.parse(value);
}
