import { expect, test } from "vitest";
import { verifyMutationReport } from "../quality/mutation-report.js";

function report(status: string) {
  return {
    files: {
      "src/example.ts": {
        source: "export const answer = 42;",
        mutants: [
          {
            id: "0",
            mutatorName: "NumberLiteral",
            replacement: "43",
            status,
            location: {
              start: { line: 1, column: 23 },
              end: { line: 1, column: 25 },
            },
          },
        ],
      },
    },
  };
}

test("accepts every planned mutant killed", () => {
  expect(verifyMutationReport(report("Pending"), report("Killed"))).toBe(1);
});

test.each([
  "Survived",
  "Timeout",
  "NoCoverage",
  "RuntimeError",
  "CompileError",
  "Pending",
  "Ignored",
  "unknown",
  "",
])("rejects inconclusive or unsuccessful status %s", (status) => {
  expect(() =>
    verifyMutationReport(report("Pending"), report(status)),
  ).toThrow();
});

test.each([null, [], {}, { files: {} }, { files: { "src/example.ts": {} } }])(
  "rejects missing or malformed report %j",
  (value) => {
    expect(() => verifyMutationReport(report("Pending"), value)).toThrow();
    expect(() => verifyMutationReport(value, report("Killed"))).toThrow();
  },
);

test("rejects changed source", () => {
  const changed = report("Killed");
  changed.files["src/example.ts"].source = "export const answer = 0;";
  expect(() => verifyMutationReport(report("Pending"), changed)).toThrow(
    "inventory",
  );
});

test("rejects missing mutants", () => {
  const changed = report("Killed");
  changed.files["src/example.ts"].mutants = [];
  expect(() => verifyMutationReport(report("Pending"), changed)).toThrow();
});

test("rejects duplicate mutant identifiers", () => {
  const changed = report("Killed");
  changed.files["src/example.ts"].mutants.push(
    ...report("Killed").files["src/example.ts"].mutants,
  );
  expect(() => verifyMutationReport(changed, changed)).toThrow("duplicate");
});

test("rejects a changed mutation operator", () => {
  const changed = report("Killed");
  for (const mutant of changed.files["src/example.ts"].mutants) {
    mutant.mutatorName = "StringLiteral";
  }
  expect(() => verifyMutationReport(report("Pending"), changed)).toThrow(
    "inventory",
  );
});

test("accepts reordered files and mutants without losing any results", () => {
  const original = report("Killed").files["src/example.ts"];
  const more = original.mutants.map((item) => ({ ...item, id: "1" }));
  const first = { ...original, mutants: [...original.mutants, ...more] };
  const second = {
    ...original,
    mutants: original.mutants.map((item) => ({ ...item, id: "2" })),
  };
  const plan = { files: { "src/example.ts": first, "src/other.ts": second } };
  const reordered = {
    files: {
      "src/other.ts": second,
      "src/example.ts": { ...first, mutants: [...first.mutants].reverse() },
    },
  };
  expect(verifyMutationReport(plan, reordered)).toBe(3);
  expect(() => verifyMutationReport(plan, report("Killed"))).toThrow(
    "inventory",
  );
});

test.each(["id", "replacement", "mutatorName"] as const)(
  "rejects changed mutant %s",
  (key) => {
    const changed = report("Killed");
    for (const item of changed.files["src/example.ts"].mutants) {
      item[key] = "altered";
    }
    expect(() => verifyMutationReport(report("Pending"), changed)).toThrow(
      "inventory",
    );
  },
);

test("rejects changed source location", () => {
  const changed = report("Killed");
  for (const item of changed.files["src/example.ts"].mutants) {
    item.location.start.column = 24;
  }
  expect(() => verifyMutationReport(report("Pending"), changed)).toThrow(
    "inventory",
  );
});

test("rejects empty inventories even when both reports agree", () => {
  expect(() => verifyMutationReport({ files: {} }, { files: {} })).toThrow(
    "mutation inventory is empty",
  );
});

test("rejects one timeout among otherwise killed mutants", () => {
  const plan = report("Killed");
  const mixed = report("Killed");
  plan.files["src/example.ts"].mutants.push(
    ...report("Killed").files["src/example.ts"].mutants.map((item) => ({
      ...item,
      id: "1",
    })),
  );
  mixed.files["src/example.ts"].mutants.push(
    ...report("Timeout").files["src/example.ts"].mutants.map((item) => ({
      ...item,
      id: "1",
    })),
  );
  expect(() => verifyMutationReport(plan, mixed)).toThrow(
    "every mutant must be killed; timeouts/errors are failures",
  );
});
