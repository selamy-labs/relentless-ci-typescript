import { z } from "zod";

const position = z.object({ line: z.number(), column: z.number() });
const mutant = z.object({
  id: z.string(),
  mutatorName: z.string(),
  replacement: z.string(),
  status: z.string().optional(),
  location: z.object({ start: position, end: position }),
});
const schema = z.object({
  files: z.record(
    z.string(),
    z.object({ source: z.string(), mutants: z.array(mutant) }),
  ),
});
type Report = z.infer<typeof schema>;

function inventory(report: Report): string {
  const entries = Object.entries(report.files).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(
    entries.map(([path, file]) => [
      path,
      file.source,
      file.mutants
        .map((item) => ({
          id: item.id,
          mutatorName: item.mutatorName,
          replacement: item.replacement,
          location: item.location,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  );
}

function mutants(report: Report) {
  const items = Object.values(report.files).flatMap((file) => file.mutants);
  if (items.length === 0) {
    throw new Error("mutation inventory is empty");
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("duplicate mutant identifiers");
  }
  return items;
}

/** Compare a fresh pre-execution inventory with raw final outcomes; fail closed. */
export function verifyMutationReport(plan: unknown, result: unknown): number {
  const expected = schema.parse(plan);
  const actual = schema.parse(result);
  const completed = mutants(actual);
  if (inventory(expected) !== inventory(actual)) {
    throw new Error("mutation inventory or source changed");
  }
  if (completed.some((item) => item.status !== "Killed")) {
    throw new Error(
      "every mutant must be killed; timeouts/errors are failures",
    );
  }
  return completed.length;
}
