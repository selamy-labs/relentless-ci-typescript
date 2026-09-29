import { rmSync } from "node:fs";
import { join, sep } from "node:path";
import { z } from "zod";
import { readJson } from "./security.js";

const key = z.string().min(1);
const count = z.number().int().positive();
const column = z.number().int().nonnegative();
const position = z.object({ line: count, column });
const location = z.object({
  start: position,
  end: position.extend({ column: column.nullable() }),
});
const implicitArm = z.strictObject({
  start: z.strictObject({}),
  end: z.strictObject({}),
});
const coverageFile = z.object({
  path: key,
  statementMap: z.record(key, location),
  fnMap: z.record(key, z.object({ decl: location, loc: location })),
  branchMap: z.record(
    key,
    z.object({ locations: z.array(z.union([location, implicitArm])).min(1) }),
  ),
  s: z.record(key, count),
  f: z.record(key, count),
  b: z.record(key, z.array(count)),
});
const report = z.record(key, coverageFile);

function sameKeys(first: object, second: object): void {
  if (
    JSON.stringify(Object.keys(first).sort()) !==
    JSON.stringify(Object.keys(second).sort())
  )
    throw new Error("coverage maps and counters disagree");
}

function verifyFile(path: string, data: z.infer<typeof coverageFile>): void {
  if (data.path !== path)
    throw new Error("coverage file path disagrees with its key");
  for (const [id, branch] of Object.entries(data.branchMap)) {
    if (branch.locations.length !== data.b[id]?.length)
      throw new Error("coverage branch locations and counters disagree");
  }
  sameKeys(data.statementMap, data.s);
  sameKeys(data.fnMap, data.f);
  sameKeys(data.branchMap, data.b);
}

export function prepareCoverage(root: string): void {
  rmSync(join(root, "coverage"), { recursive: true, force: true });
}

export function verifyCoverageReport(value: unknown, expected: string[]): void {
  const data = report.parse(value);
  if (expected.length === 0)
    throw new Error("coverage source inventory is empty");
  if (
    JSON.stringify(Object.keys(data).sort()) !==
    JSON.stringify([...expected].sort())
  )
    throw new Error("coverage source inventory is incomplete");
  for (const [path, entry] of Object.entries(data)) verifyFile(path, entry);
}

export function verifyCoverage(root: string, sources: string[]): void {
  const expected = sources.filter(
    (path) => !path.startsWith(join(root, "tests") + sep),
  );
  verifyCoverageReport(
    readJson(join(root, "coverage", "coverage-final.json")),
    expected,
  );
}
