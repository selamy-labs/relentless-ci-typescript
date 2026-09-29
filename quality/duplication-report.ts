import { dirname } from "node:path";
import { z } from "zod";

const integer = z.number().int().nonnegative();
const cleanMetrics = z.strictObject({
  clones: z.literal(0),
  duplicatedLines: z.literal(0),
  duplicatedTokens: z.literal(0),
  lines: integer,
  newClones: z.literal(0),
  newDuplicatedLines: z.literal(0),
  percentage: z.literal(0),
  percentageTokens: z.literal(0),
  sources: integer,
  tokens: integer,
});
const eligible = z.strictObject({
  bytes: integer,
  format: z.enum(["javascript", "typescript"]),
  lines: z.number().int().min(4),
  tokens: z.number().int().min(50),
});
const source = eligible.extend({
  complexity: integer,
  duplicatedLines: z.literal(0),
  duplicatedTokens: z.literal(0),
  path: z.string().min(1),
});
const folder = z.strictObject({
  bytes: integer,
  complexity: integer,
  duplicatedLines: z.literal(0),
  files: integer,
  lines: integer,
  path: z.string().min(1),
  tokens: integer,
});
const report = z.strictObject({
  duplicates: z.array(z.unknown()).max(0),
  statistics: z.strictObject({
    detectionDate: z.iso.datetime(),
    formats: z.partialRecord(
      z.enum(["javascript", "typescript"]),
      cleanMetrics,
    ),
    total: cleanMetrics,
  }),
  summary: z.strictObject({
    by: z.literal("tokens"),
    files: z.array(source),
    folders: z.array(folder),
    totalFiles: integer,
    totalFolders: integer,
  }),
});

export type EligibleSource = z.infer<typeof eligible>;

function sum(
  files: EligibleSource[],
  key: "bytes" | "lines" | "tokens",
): number {
  return files.reduce((total, file) => total + file[key], 0);
}

function verifyMetrics(
  value: z.infer<typeof cleanMetrics>,
  files: EligibleSource[],
): void {
  if (
    value.sources !== files.length ||
    value.lines !== sum(files, "lines") ||
    value.tokens !== sum(files, "tokens")
  ) {
    throw new Error(
      "duplication statistics differ from eligible source receipts",
    );
  }
}

function verifyFile(
  file: z.infer<typeof source>,
  expected: Map<string, EligibleSource>,
): void {
  const item = eligible.parse(expected.get(file.path));
  if (
    item.bytes !== file.bytes ||
    item.format !== file.format ||
    item.lines !== file.lines ||
    item.tokens !== file.tokens
  ) {
    throw new Error("duplication file receipt differs from enrolled source");
  }
}

function verifyFolder(
  value: z.infer<typeof folder>,
  expected: Map<string, EligibleSource>,
): void {
  const files = [...expected]
    .filter(([path]) => dirname(path) === value.path)
    .map(([, file]) => file);
  if (
    value.files !== files.length ||
    value.bytes !== sum(files, "bytes") ||
    value.lines !== sum(files, "lines") ||
    value.tokens !== sum(files, "tokens")
  ) {
    throw new Error("duplication folder receipt differs from eligible source");
  }
}

function verifyPaths(actual: string[], expected: string[]): void {
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) {
    throw new Error("duplication source or folder inventory is incomplete");
  }
}

export function verifyDuplicationReport(
  value: unknown,
  expected: Map<string, EligibleSource>,
): void {
  const parsed = report.parse(value);
  const files = [...expected.values()];
  const folders = [
    ...new Set([...expected.keys()].map((path) => dirname(path))),
  ];
  verifyPaths(
    parsed.summary.files.map((file) => file.path),
    [...expected.keys()],
  );
  verifyPaths(
    parsed.summary.folders.map((item) => item.path),
    folders,
  );
  if (
    parsed.summary.totalFiles !== files.length ||
    parsed.summary.totalFolders !== folders.length
  ) {
    throw new Error("duplication summary totals differ from enrolled source");
  }
  for (const file of parsed.summary.files) verifyFile(file, expected);
  for (const item of parsed.summary.folders) verifyFolder(item, expected);
  verifyMetrics(parsed.statistics.total, files);
  verifyPaths(Object.keys(parsed.statistics.formats), [
    ...new Set(files.map((file) => file.format)),
  ]);
  for (const [format, metrics] of Object.entries(parsed.statistics.formats)) {
    verifyMetrics(
      metrics,
      files.filter((file) => file.format === format),
    );
  }
}
