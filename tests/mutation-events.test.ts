import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect, test } from "vitest";
import { checkMutation } from "../quality/check-mutation.js";
import { mutationPlan } from "../quality/mutation-plan.js";

function fixture(root: string) {
  const source = "export const answer = 42;";
  const mutant = {
    id: "0",
    mutatorName: "NumberLiteral",
    replacement: "43",
    status: "Killed",
    location: { start: { line: 1, column: 23 }, end: { line: 1, column: 25 } },
  };
  const directory = join(root, ".quality-results", "mutation-events");
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "sample.ts"), source);
  const event = {
    mutantPlans: [
      {
        mutant: {
          ...mutant,
          fileName: join(root, "src", "sample.ts"),
          location: {
            start: { line: 0, column: 22 },
            end: { line: 0, column: 24 },
          },
        },
      },
    ],
  };
  const result = { files: { "src/sample.ts": { source, mutants: [mutant] } } };
  writeFileSync(
    join(directory, "00001-onMutationTestingPlanReady.json"),
    JSON.stringify(event),
  );
  writeFileSync(
    join(directory, "00003-onMutationTestReportReady.json"),
    JSON.stringify(result),
  );
  return { event, result, directory };
}

function withRepository(check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "relentless-events-"));
  try {
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("verifies real event files and binds them to source bytes", () => {
  withRepository((root) => {
    fixture(root);
    expect(checkMutation(root)).toBe(1);
    writeFileSync(join(root, "src", "sample.ts"), "changed");
    expect(() => checkMutation(root)).toThrow("source changed");
  });
});

test("groups all planned mutations of the same source", () => {
  withRepository((root) => {
    const { event } = fixture(root);
    event.mutantPlans.push(
      ...event.mutantPlans.map(({ mutant }) => ({
        mutant: { ...mutant, id: "1" },
      })),
    );
    expect(
      mutationPlan(event, root).files["src/sample.ts"]?.mutants,
    ).toHaveLength(2);
  });
});

test.each(["missing", "duplicate", "invalid-json"])(
  "rejects %s final events",
  (defect) => {
    withRepository((root) => {
      const { directory } = fixture(root);
      const file = join(directory, "00003-onMutationTestReportReady.json");
      if (defect === "missing") {
        rmSync(file);
      }
      if (defect === "duplicate") {
        writeFileSync(
          join(directory, "99999-onMutationTestReportReady.json"),
          "{}",
        );
      }
      if (defect === "invalid-json") {
        writeFileSync(file, "invalid");
      }
      expect(() => checkMutation(root)).toThrow();
    });
  },
);

test("rejects absent event directories", () => {
  withRepository((root) => {
    expect(() => checkMutation(root)).toThrow();
  });
});

test.each(["parent", "parent-file"])(
  "rejects %s paths outside the repository",
  (kind) => {
    withRepository((root) => {
      const { event } = fixture(root);
      for (const { mutant } of event.mutantPlans) {
        mutant.fileName =
          kind === "parent" ? dirname(root) : join(dirname(root), "outside.ts");
      }
      expect(() => mutationPlan(event, root)).toThrow("inside the repository");
    });
  },
);
