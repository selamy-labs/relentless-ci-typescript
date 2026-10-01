import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const executable = resolve(
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
);
const policy = readFileSync("quality/architecture.json", "utf8");
const roots: string[] = [];
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-architecture-"));
  roots.push(root);
  const contents = {
    "package.json": JSON.stringify({
      type: "module",
      dependencies: { runtime: "1.0.0" },
      devDependencies: { development: "1.0.0" },
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: { module: "NodeNext" },
    }),
    "quality/architecture.json": policy,
    ".dependency-cruiser-known-violations.json": JSON.stringify([
      {
        rule: { name: "no-undeclared", severity: "error" },
        from: "src/index.ts",
        to: "node_modules/undeclared/index.js",
      },
    ]),
    "src/index.ts": "export const value = 1;\n",
    "tests/example.ts": "import '../src/index.js';\n",
    "quality/example.ts": "import 'development';\n",
    "dependency-policy.mjs": "export const value = 1;\n",
    "dependency-main.mjs": "import './dependency-policy.mjs';\n",
    ...files,
  };
  for (const [name, contents_] of Object.entries(contents)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents_);
  }
  for (const name of ["runtime", "development", "undeclared"]) {
    const path = join(root, "node_modules", name);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        type: "module",
        exports: "./index.js",
      }),
    );
    writeFileSync(join(path, "index.js"), "export const value = 1;\n");
  }
  return root;
}
function cruise(root: string, config = "quality/architecture.json") {
  return spawnSync(
    process.execPath,
    [
      executable,
      "--config",
      config,
      "--no-ignore-known",
      "--no-cache",
      "--output-type",
      "err-long",
      "src",
      "tests",
      "quality",
    ],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("declared runtime imports and development imports in tooling pass", () => {
  const result = cruise(repository({ "src/index.ts": "import 'runtime';\n" }));
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  ["src/index.ts", "import 'development';\n", "no-dev-in-production"],
  [
    "src/index.ts",
    "import type { X } from 'development';\n",
    "no-dev-in-production",
  ],
  [
    "src/index.ts",
    "import '../tests/example.js';\n",
    "no-tooling-in-production",
  ],
  [
    "src/index.ts",
    "import '../quality/example.js';\n",
    "no-tooling-in-production",
  ],
  ["src/index.ts", "import 'undeclared';\n", "no-undeclared"],
  [
    "src/index.ts",
    "import '../dependency-policy.mjs';\n",
    "no-tooling-in-production",
  ],
  [
    "src/index.ts",
    "import '../dependency-main.mjs';\n",
    "no-tooling-in-production",
  ],
  ["quality/example.ts", "import 'undeclared';\n", "no-undeclared"],
  ["tests/example.ts", "import 'undeclared';\n", "no-undeclared"],
  ["src/index.ts", "import './missing.js';\n", "no-unresolved"],
])("%s rejects %s", (name, source, rule) => {
  const result = cruise(repository({ [name]: source }));
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBeGreaterThan(0);
  expect(result.stdout).toContain(rule);
});

test("never-imported nested module cycles are analyzed", () => {
  const result = cruise(
    repository({
      "src/nested/first.ts": "import './second.js';\n",
      "src/nested/second.ts": "import './first.js';\n",
    }),
  );
  expect(result.status, result.stdout + result.stderr).toBeGreaterThan(0);
  expect(result.stdout).toContain("no-cycles");
  expect(result.stdout).toContain("src/nested/first.ts");
});

test("missing and malformed configuration cannot pass", () => {
  const root = repository({ "quality/broken.json": "{broken" });
  for (const config of ["quality/missing.json", "quality/broken.json"]) {
    expect(cruise(root, config).status).toBe(1);
  }
}, 30_000);
