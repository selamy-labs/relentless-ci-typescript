import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  prepareCoverage,
  verifyCoverage,
  verifyCoverageReport,
} from "../quality/coverage-report.js";

const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-coverage-"));
  roots.push(root);
  mkdirSync(join(root, "coverage"));
  return root;
}
function entry(path: string) {
  const loc = { start: { line: 1, column: 0 }, end: { line: 2, column: null } };
  return {
    path,
    statementMap: { statement: loc },
    fnMap: { function: { decl: loc, loc } },
    branchMap: { branch: { locations: [loc, loc] } },
    s: { statement: 1 },
    f: { function: 2 },
    b: { branch: [1, 3] },
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("all source kinds and counter identities can be complete", () => {
  const names = ["src/a.ts", "quality/config.ts", "eslint.config.mjs"];
  verifyCoverageReport(
    Object.fromEntries(names.map((name) => [name, entry(name)])),
    names,
  );
});

test.each([null, [], 1, true, "report", {}, { extra: entry("extra") }])(
  "missing or unrelated native coverage fails: %j",
  (value) => {
    expect(() => {
      verifyCoverageReport(value, ["src/a.ts"]);
    }).toThrow();
  },
);

test("an omitted never-imported file or duplicate expected path fails", () => {
  const value = { "src/a.ts": entry("src/a.ts") };
  expect(() => {
    verifyCoverageReport(value, ["src/a.ts", "quality/unimported.ts"]);
  }).toThrow("inventory");
  expect(() => {
    verifyCoverageReport(value, ["src/a.ts", "src/a.ts"]);
  }).toThrow("inventory");
  expect(() => {
    verifyCoverageReport({}, []);
  }).toThrow("empty");
});

test.each([0, -1, 0.5, "1", null])(
  "uncovered or malformed statement count %j fails",
  (count) => {
    const value = entry("source");
    expect(() => {
      verifyCoverageReport({ source: { ...value, s: { statement: count } } }, [
        "source",
      ]);
    }).toThrow();
  },
);

test.each([0, -1, 0.5, "1", null])(
  "uncovered or malformed function count %j fails",
  (count) => {
    const value = entry("source");
    expect(() => {
      verifyCoverageReport({ source: { ...value, f: { function: count } } }, [
        "source",
      ]);
    }).toThrow();
  },
);

test.each(
  [[], [1, 0], [1, -1], [1, 0.5], [1, "1"], [1, null], [1]].map((counts) => ({
    counts,
  })),
)(
  "every declared branch requires a valid positive counter: %j",
  ({ counts }) => {
    const value = entry("source");
    expect(() => {
      verifyCoverageReport({ source: { ...value, b: { branch: counts } } }, [
        "source",
      ]);
    }).toThrow();
  },
);

test.each(["s", "f", "b"])(
  "counter/map identities for %s must match",
  (field) => {
    const value = entry("source");
    expect(() => {
      verifyCoverageReport({ source: { ...value, [field]: {} } }, ["source"]);
    }).toThrow(field === "b" ? "branch locations" : "maps");
  },
);

test("declared positions, branch arms and file identities must be valid", () => {
  const value = entry("source");
  expect(() => {
    verifyCoverageReport({ source: { ...value, path: "other" } }, ["source"]);
  }).toThrow("path");
  expect(() => {
    verifyCoverageReport(
      { source: { ...value, statementMap: { statement: {} } } },
      ["source"],
    );
  }).toThrow();
  expect(() => {
    verifyCoverageReport(
      { source: { ...value, branchMap: { branch: { locations: [] } } } },
      ["source"],
    );
  }).toThrow();
});

test("fresh report cleanup is idempotent and removes stale coverage", () => {
  const root = repository();
  writeFileSync(join(root, "coverage", "coverage-final.json"), "stale");
  writeFileSync(join(root, "source.ts"), "export {};\n");
  prepareCoverage(root);
  expect(existsSync(join(root, "coverage"))).toBe(false);
  expect(readFileSync(join(root, "source.ts"), "utf8")).toBe("export {};\n");
  prepareCoverage(root);
});

test("native report lookup enrolls configs and skips only the tests directory", () => {
  const root = repository();
  const names = [
    join(root, "src", "a.ts"),
    join(root, "quality", "config.ts"),
    join(root, "tests-more.ts"),
  ];
  const value = Object.fromEntries(names.map((name) => [name, entry(name)]));
  writeFileSync(
    join(root, "coverage", "coverage-final.json"),
    JSON.stringify(value),
  );
  verifyCoverage(root, [...names, join(root, "tests", "example.test.ts")]);
  rmSync(join(root, "coverage", "coverage-final.json"));
  expect(() => {
    verifyCoverage(root, names);
  }).toThrow();
});

test.each([
  ...[0, -1, 1.5, "1", null].map((value) => ({ part: "line", value })),
  ...[-1, 0.5, "0"].map((value) => ({ part: "column", value })),
])("invalid source $part ($value) fails", ({ part, value: invalid }) => {
  const value = entry("source");
  const loc = value.statementMap.statement;
  for (const field of ["start", "end"] as const) {
    const changed = { ...loc, [field]: { ...loc[field], [part]: invalid } };
    expect(() => {
      verifyCoverageReport(
        { source: { ...value, statementMap: { statement: changed } } },
        ["source"],
      );
    }).toThrow();
  }
});

test("zero and positive columns pass, but only end columns may be null", () => {
  const value = entry("source");
  const loc = value.statementMap.statement;
  verifyCoverageReport(
    {
      source: {
        ...value,
        statementMap: { statement: { ...loc, end: { line: 2, column: 2 } } },
      },
    },
    ["source"],
  );
  expect(() => {
    verifyCoverageReport(
      {
        source: {
          ...value,
          statementMap: {
            statement: { ...loc, start: { line: 1, column: null } },
          },
        },
      },
      ["source"],
    );
  }).toThrow();
});

test("empty file and counter identities cannot hide incomplete records", () => {
  expect(() => {
    verifyCoverageReport({ "": entry("") }, [""]);
  }).toThrow();
  const value = entry("source");
  expect(() => {
    verifyCoverageReport(
      {
        source: {
          ...value,
          s: { "": 1 },
          statementMap: { "": value.statementMap.statement },
        },
      },
      ["source"],
    );
  }).toThrow();
  expect(() => {
    verifyCoverageReport(
      { source: { ...value, b: { ...value.b, extra: [1] } } },
      ["source"],
    );
  }).toThrow("maps");
});

test("native implicit else locations still require a covered branch arm", () => {
  const value = entry("source");
  const branchMap = {
    branch: {
      locations: [value.statementMap.statement, { start: {}, end: {} }],
    },
  };
  verifyCoverageReport({ source: { ...value, branchMap } }, ["source"]);
  expect(() => {
    verifyCoverageReport(
      { source: { ...value, branchMap, b: { branch: [1, 0] } } },
      ["source"],
    );
  }).toThrow();
});

test.each([
  { start: {}, end: {} },
  { start: {}, end: { line: 1 } },
  { start: { line: 1 }, end: {} },
])(
  "implicit locations cannot excuse malformed statements or partial positions: %j",
  (loc) => {
    const value = entry("source");
    expect(() => {
      verifyCoverageReport(
        { source: { ...value, statementMap: { statement: loc } } },
        ["source"],
      );
    }).toThrow();
  },
);

test.each([
  ["a", "b"],
  ["b", "a"],
])("map matching ignores insertion order %s,%s", (first, second) => {
  const value = entry("source");
  const statementMap = {
    [first]: value.statementMap.statement,
    [second]: value.statementMap.statement,
  };
  const s = { [second]: 2, [first]: 1 };
  verifyCoverageReport({ source: { ...value, statementMap, s } }, ["source"]);
});

test("a declared branch with no locations or counters cannot pass", () => {
  const value = entry("source");
  expect(() => {
    verifyCoverageReport(
      {
        source: {
          ...value,
          branchMap: { branch: { locations: [] } },
          b: { branch: [] },
        },
      },
      ["source"],
    );
  }).toThrow();
});

test.each(["decl", "loc"])(
  "function %s positions must exist and be valid",
  (field) => {
    const value = entry("source");
    for (const position of [undefined, {}, { start: {}, end: {} }]) {
      const fnMap = {
        function: { ...value.fnMap.function, [field]: position },
      };
      expect(() => {
        verifyCoverageReport({ source: { ...value, fnMap } }, ["source"]);
      }).toThrow();
    }
  },
);
