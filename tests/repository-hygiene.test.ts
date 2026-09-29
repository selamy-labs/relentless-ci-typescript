import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  gitPaths,
  verifyRepository,
  verifyText,
} from "../quality/repository-hygiene.js";
import { generatedRoots } from "../quality/source-scope.js";

const roots: string[] = [];
vi.mock("node:child_process", { spy: true });
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-hygiene-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  return root;
}
function file(root: string, name: string, data: string | Uint8Array): void {
  const parts = name.split("/");
  parts.pop();
  mkdirSync(join(root, ...parts), { recursive: true });
  writeFileSync(join(root, name), data);
}

test("Git inventory preserves spaces, Unicode and complete NUL framing", () => {
  expect(gitPaths(Buffer.from("src/spaced name.ts\0docs/é.md\0"))).toEqual([
    "src/spaced name.ts",
    "docs/é.md",
  ]);
  expect(gitPaths(Buffer.from(""))).toEqual([]);
  expect(() => gitPaths(Buffer.from("file.ts"))).toThrow("incomplete");
  expect(() => gitPaths(Uint8Array.from([255]))).toThrow();
  expect(() => gitPaths(Uint8Array.from([255, 0]))).toThrow();
});

test("native Git and filesystem inventories include tracked and ignored authored text", () => {
  const root = repository();
  file(root, "src/a.ts", "export const value = 1;\n");
  file(root, ".gitignore", "docs/\n");
  file(root, "docs/ignored.md", "still checked\n");
  execFileSync("git", ["add", "src/a.ts"], { cwd: root });
  expect(() => {
    verifyRepository(root);
  }).not.toThrow();
  file(root, "docs/ignored.md", "<<<<<<< HEAD\nunfinished\n");
  expect(execFileSync).toHaveBeenCalledWith("git", ["ls-files", "-z"], {
    cwd: root,
    timeout: 30_000,
  });
  expect(() => {
    verifyRepository(root);
  }).toThrow("conflict markers");
});

test.each([...generatedRoots].filter((name) => name !== ".git"))(
  "only declared top-level generated directory %s is excluded",
  (name) => {
    const root = repository();
    file(root, "README.md", "public text\n");
    file(root, `${name}/private.bin`, Uint8Array.from([255, 0]));
    expect(() => {
      verifyRepository(root);
    }).not.toThrow();
    file(root, `nested/${name}/private.bin`, Uint8Array.from([255, 0]));
    expect(() => {
      verifyRepository(root);
    }).toThrow("protected text inventory");
  },
);

test("clean untracked first-use text is checked without a commit", () => {
  const root = repository();
  file(root, "README.md", "public text\n");
  expect(() => {
    verifyRepository(root);
  }).not.toThrow();
});

test("native unmerged index is rejected even after the text is resolved", () => {
  const root = repository();
  file(root, "src/a.ts", "export const value = 1;\n");
  execFileSync("git", ["add", "src/a.ts"], { cwd: root });
  const object = execFileSync("git", ["hash-object", "src/a.ts"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const stages = [1, 2, 3]
    .map((stage) => `100644 ${object} ${String(stage)}\tsrc/a.ts\n`)
    .join("");
  execFileSync("git", ["update-index", "--index-info"], {
    cwd: root,
    input: `0 ${"0".repeat(40)}\tsrc/a.ts\n${stages}`,
  });
  expect(
    execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }),
  ).toBe("src/a.ts\0src/a.ts\0src/a.ts\0");
  expect(() => {
    verifyRepository(root);
  }).toThrow("duplicated");
});

test("empty repository cannot pass hygiene", () => {
  expect(() => {
    verifyRepository(repository());
  }).toThrow("empty or duplicated");
});

test("missing Git repository is a failed check", () => {
  const root = repository();
  rmSync(join(root, ".git"), { recursive: true, force: true });
  file(root, "README.md", "public text\n");
  expect(() => {
    verifyRepository(root);
  }).toThrow();
});

test("authored symlinks cannot hide unchecked text", () => {
  const root = repository();
  mkdirSync(join(root, "docs"));
  symlinkSync(join(root, "docs"), join(root, "alias"), "junction");
  expect(() => {
    verifyRepository(root);
  }).toThrow("authored symlinks");
});

test("unsupported binaries and invalid UTF-8 cannot pass", () => {
  const root = repository();
  file(root, "payload.png", "binary-looking artifact");
  expect(() => {
    verifyRepository(root);
  }).toThrow("protected text inventory");
  rmSync(join(root, "payload.png"));
  file(root, "README.md", Uint8Array.from([255]));
  expect(() => {
    verifyRepository(root);
  }).toThrow();
});

test.each(["<<<<<<< HEAD", "========", ">>>>>>> branch", "||||||| ancestor"])(
  "rejects native conflict marker %s",
  (marker) => {
    expect(() => {
      verifyText(Buffer.from(`before\n${marker}\nafter\n`));
    }).toThrow("conflict markers");
  },
);

test("plain UTF-8 and punctuation remain text; NUL does not", () => {
  expect(() => {
    verifyText(Buffer.from("é\ntext <<<<<<< middle\n====== ordinary\n"));
  }).not.toThrow();
  expect(() => {
    verifyText(Buffer.from("before\0after"));
  }).toThrow("binary data");
});
