import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  generatedRoots,
  verifySources,
  verifyTracked,
} from "../quality/source-scope.js";

const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-source-scope-"));
  roots.push(root);
  return root;
}
function source(root: string, name: string, text: string): string {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}
function git(root: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test.each(["\n", "\r\n", "\r"])(
  "enforces physical limits with %j endings",
  (ending) => {
    for (const lastNewline of [false, true]) {
      const root = repository();
      const text = [
        "// comment",
        "",
        ...Array<string>(397).fill("const value = 1;"),
      ].join(ending);
      const path = source(
        root,
        "quality/check.ts",
        text + (lastNewline ? ending : ""),
      );
      expect(verifySources(root)).toEqual([path]);
      writeFileSync(
        path,
        text + ending + "// extra" + (lastNewline ? ending : ""),
      );
      expect(() => verifySources(root)).toThrow(
        "400 physical lines exceeds 399",
      );
    }
  },
);

test("discovers tests, scripts and never-imported code despite ignore files", () => {
  const root = repository();
  const paths = [
    source(root, "src/package/unused.ts", "const unused = 1;"),
    source(root, "tests/nested/example.ts", "// a test"),
    source(root, "quality/script.ts", "// a script"),
  ];
  source(root, ".gitignore", "*.ts\n");
  expect(verifySources(root).sort()).toEqual(paths.sort());
});

test.each([
  "escape.ts",
  "scripts/escape.ts",
  "quality/config.mts",
  "quality/helper.js",
  "src/UPPER.TS",
  "src/ui.tsx",
  "src/helper.cts",
  "src/helper.cjs",
  "src/ui.jsx",
  "quality/helper.mjs",
])("rejects unenrolled source: %s", (name) => {
  const root = repository();
  source(root, name, "// cannot hide from analysis");
  expect(() => verifySources(root)).toThrow("outside supported scope");
});

test.each(["vitest.config.ts", "eslint.config.mjs"])(
  "includes executable root configuration %s",
  (name) => {
    const root = repository();
    const path = source(root, name, "");
    expect(verifySources(root)).toEqual([path]);
  },
);

test.each([...generatedRoots])(
  "exempts only the top-level generated directory %s",
  (generated) => {
    const root = repository();
    const owned = source(root, "quality/check.ts", "export {};\n");
    source(root, `${generated}/generated.ts`, "// generated\n".repeat(400));
    expect(verifySources(root)).toEqual([owned]);
    source(
      root,
      `quality/${generated}/authored.ts`,
      "// authored\n".repeat(400),
    );
    expect(() => verifySources(root)).toThrow("generated directory");
  },
);

test.each([false, true])(
  "rejects authored symlinks (directory=%s)",
  (directory) => {
    const root = repository();
    const target = join(root, "target");
    if (directory) mkdirSync(target);
    else writeFileSync(target, "export {};");
    symlinkSync(target, join(root, "link.ts"), directory ? "dir" : "file");
    expect(() => verifySources(root)).toThrow("symlinks are unsupported");
  },
);

test("rejects empty discovery", () => {
  expect(() => verifySources(repository())).toThrow("no authored source");
});

test("accepts tracked source and untracked generated output", () => {
  const root = repository();
  git(root, "init", "--quiet");
  source(root, "quality/check.ts", "export {};");
  source(root, "dist/output.ts", "// generated");
  git(root, "add", "quality/check.ts");
  expect(() => {
    verifyTracked(root);
  }).not.toThrow();
});

test("rejects committed source inside generated exemptions", () => {
  const root = repository();
  git(root, "init", "--quiet");
  source(root, "dist/output.ts", "// cannot bypass analysis");
  git(root, "add", "--force", "dist/output.ts");
  expect(() => {
    verifyTracked(root);
  }).toThrow("tracked file in a generated exemption");
});

test("fails if the Git repository is missing", () => {
  expect(() => {
    verifyTracked(repository());
  }).toThrow();
});

test("rejects 400 lines without a terminal newline", () => {
  const root = repository();
  source(
    root,
    "quality/over.ts",
    Array<string>(400).fill("// a line").join("\n"),
  );
  expect(() => verifySources(root)).toThrow("400 physical lines exceeds 399");
});

test("rejects a tracked root file using a generated-directory name", () => {
  const root = repository();
  git(root, "init", "--quiet");
  source(root, "dist", "unexpected build output");
  git(root, "add", "--force", "dist");
  expect(() => {
    verifyTracked(root);
  }).toThrow("tracked file in a generated exemption");
});
