import { expect, test } from "vitest";
import {
  verifyAudit,
  verifySast,
  verifySecrets,
} from "../quality/security-reports.js";

const lockfile = "/example/package-lock.json";
function lock() {
  return {
    lockfileVersion: 3,
    packages: {
      "": { name: "sample", version: "0.1.0" },
      "node_modules/first": { version: "1.0" },
      "node_modules/parent/node_modules/alias": {
        name: "second",
        version: "2.0",
      },
    },
  };
}
function audit() {
  return {
    results: [
      {
        source: { type: "lockfile", path: lockfile },
        packages: [
          { package: { name: "second", version: "2.0", ecosystem: "npm" } },
          { package: { name: "first", version: "1.0", ecosystem: "npm" } },
        ],
      },
    ],
  };
}
function sast() {
  return {
    results: [],
    errors: [],
    skipped_rules: [],
    paths: { scanned: ["src/b.ts", "src/a.ts"] },
  };
}

test("accepts complete static security results in either file order", () => {
  expect(() => {
    verifySast(sast(), ["src/a.ts", "src/b.ts"]);
  }).not.toThrow();
});

test.each(["results", "errors", "skipped_rules"])(
  "rejects static security %s",
  (field) => {
    const value = { ...sast(), [field]: [{ message: "unresolved result" }] };
    expect(() => {
      verifySast(value, ["src/a.ts", "src/b.ts"]);
    }).toThrow();
  },
);

test.each([
  { scanned: [] },
  { scanned: ["other.ts"] },
  { scanned: ["src/a.ts", "src/b.ts", "extra.ts"] },
])("rejects wrong scanned inventory %j", ({ scanned }) => {
  const value = { ...sast(), paths: { scanned } };
  expect(() => {
    verifySast(value, ["src/a.ts", "src/b.ts"]);
  }).toThrow("inventory is incomplete");
});

test.each([null, {}, true, [], { results: [] }])(
  "rejects malformed static reports %j",
  (value) => {
    expect(() => {
      verifySast(value, ["src/a.ts"]);
    }).toThrow();
  },
);

test("accepts full audit including aliases, nested packages and reversed response order", () => {
  expect(() => {
    verifyAudit(audit(), lock(), lockfile);
  }).not.toThrow();
});

test("deduplicates repeated locked installations while auditing every distinct version", () => {
  const locked = lock();
  const repeated = {
    ...locked,
    packages: {
      ...locked.packages,
      "node_modules/other/node_modules/first": { version: "1.0" },
    },
  };
  expect(() => {
    verifyAudit(audit(), repeated, lockfile);
  }).not.toThrow();
});

test("derives nested nonaliased dependency names correctly", () => {
  const locked = lock();
  const nested = {
    ...locked,
    packages: {
      ...locked.packages,
      "node_modules/parent/node_modules/third": { version: "3.0" },
    },
  };
  const value = audit();
  const [group] = value.results;
  if (!group) throw new Error("fixture missing");
  group.packages.push({
    package: { name: "third", version: "3.0", ecosystem: "npm" },
  });
  expect(() => {
    verifyAudit(value, nested, lockfile);
  }).not.toThrow();
});

test.each(["vulnerabilities", "groups", "license_violations"])(
  "rejects audit %s without a severity floor",
  (field) => {
    const value = audit();
    const [group] = value.results;
    if (!group) throw new Error("fixture missing");
    group.packages = group.packages.map((item) => ({
      ...item,
      [field]: [{ severity: "LOW" }],
    }));
    expect(() => {
      verifyAudit(value, lock(), lockfile);
    }).toThrow();
  },
);

test("rejects audit errors alongside apparently complete packages", () => {
  expect(() => {
    verifyAudit({ ...audit(), errors: ["query failed"] }, lock(), lockfile);
  }).toThrow();
});

test.each(["file", "scanner"])("rejects wrong audit source type %s", (type) => {
  const value = audit();
  const [group] = value.results;
  if (!group) throw new Error("fixture missing");
  group.source.type = type;
  expect(() => {
    verifyAudit(value, lock(), lockfile);
  }).toThrow();
});

test("rejects a substituted lockfile", () => {
  expect(() => {
    verifyAudit(audit(), lock(), "/other/package-lock.json");
  }).toThrow("requested lockfile");
});

test.each([0, 2])(
  "requires exactly one lockfile group, received %s",
  (count) => {
    const value = {
      ...audit(),
      results: Array.from({ length: count }, () => audit().results[0]),
    };
    expect(() => {
      verifyAudit(value, lock(), lockfile);
    }).toThrow();
  },
);

test.each(["name", "version", "ecosystem"])(
  "rejects substituted package %s",
  (field) => {
    const value = audit();
    const [group] = value.results;
    if (!group) throw new Error("fixture missing");
    group.packages = group.packages.map((item) => ({
      package: { ...item.package, [field]: "substituted" },
    }));
    expect(() => {
      verifyAudit(value, lock(), lockfile);
    }).toThrow("inventory is incomplete");
  },
);

test("rejects omitted and duplicated audited packages", () => {
  const value = audit();
  const [group] = value.results;
  if (!group) throw new Error("fixture missing");
  group.packages.pop();
  expect(() => {
    verifyAudit(value, lock(), lockfile);
  }).toThrow("inventory is incomplete");
  group.packages = [...group.packages, ...group.packages];
  expect(() => {
    verifyAudit(value, lock(), lockfile);
  }).toThrow("duplicate package");
});

test("empty audit and lock cannot pass", () => {
  const value = audit();
  const [group] = value.results;
  if (!group) throw new Error("fixture missing");
  group.packages = [];
  expect(() => {
    verifyAudit(value, { lockfileVersion: 3, packages: {} }, lockfile);
  }).toThrow("inventory is incomplete");
});

test.each([null, {}, true, [], { results: [] }])(
  "rejects malformed audit %j",
  (value) => {
    expect(() => {
      verifyAudit(value, lock(), lockfile);
    }).toThrow();
  },
);

test("accepts empty secret findings and rejects findings or malformed output", () => {
  expect(() => {
    verifySecrets([]);
  }).not.toThrow();
  expect(() => {
    verifySecrets([{ RuleID: "a-secret" }]);
  }).toThrow();
  expect(() => {
    verifySecrets({});
  }).toThrow();
});
