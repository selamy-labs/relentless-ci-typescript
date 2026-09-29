import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const sourceRoots = ["src", "tests", "quality"];
export const generatedRoots = new Set([
  ".git",
  ".venv",
  ".codegraph",
  ".pytest_cache",
  ".hypothesis",
  "node_modules",
  "dist",
  "coverage",
  ".quality-results",
  ".quality-build",
  ".stryker-tmp",
]);
const rootConfiguration = new Set(["vitest.config.ts", "eslint.config.mjs"]);
const extensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
]);
const maximumLines = 399;

function walk(root: string, directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (directory === root && generatedRoots.has(name)) {
      return [];
    }
    return visit(root, join(directory, name));
  });
}

function visit(root: string, path: string): string[] {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) {
    throw new Error(`authored symlinks are unsupported: ${path}`);
  }
  if (info.isDirectory()) {
    return walk(root, path);
  }
  if (extensions.has(extname(path).toLowerCase())) {
    return [path];
  }
  return [];
}

function validatePath(root: string, path: string): void {
  const name = relative(root, path);
  if (rootConfiguration.has(name)) {
    return;
  }
  if (name.split(sep).some((part) => generatedRoots.has(part))) {
    throw new Error(`authored source in a generated directory: ${path}`);
  }
  const enrolled = sourceRoots.some((scope) =>
    name.startsWith(`${scope}${sep}`),
  );
  if (!enrolled || extname(path) !== ".ts") {
    throw new Error(`source file outside supported scope: ${path}`);
  }
}

function verifySize(path: string): void {
  const lines = readFileSync(path, "utf8").split(/\r\n|\r|\n/u);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  if (lines.length > maximumLines) {
    throw new Error(
      `${path}: ${String(lines.length)} physical lines exceeds 399`,
    );
  }
}

export function verifySources(root: string): string[] {
  const paths = walk(root, root);
  if (paths.length === 0) {
    throw new Error("no authored source files discovered");
  }
  for (const path of paths) {
    validatePath(root, path);
    verifySize(path);
  }
  return paths;
}

export function verifyTracked(root: string): void {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root });
  for (const name of output.toString("utf8").split("\0")) {
    validateTracked(name);
  }
}

function validateTracked(name: string): void {
  const generated = [...generatedRoots].some(
    (scope) => name === scope || name.startsWith(`${scope}/`),
  );
  if (generated) {
    throw new Error(`tracked file in a generated exemption: ${name}`);
  }
}
