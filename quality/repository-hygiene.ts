import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { verifyPathNames, verifyTextKind } from "./portable-paths.js";
import { generatedRoots } from "./source-scope.js";

const conflicts = /^(?:<{7,}|={7,}|>{7,}|\|{7,})(?:[ \t]|$)/mu;

export function diskFiles(root: string, directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (directory === root && generatedRoots.has(entry.name)) {
      return [];
    }
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("repository hygiene does not support authored symlinks");
    }
    return entry.isDirectory()
      ? diskFiles(root, path)
      : [relative(root, path).split(sep).join("/")];
  });
}

export function gitPaths(data: Uint8Array): string[] {
  const value = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (value === "") {
    return [];
  }
  if (!value.endsWith("\0")) {
    throw new Error("native Git path inventory is incomplete");
  }
  return value.slice(0, -1).split("\0");
}

export function verifyText(data: Uint8Array): void {
  const value = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (value.includes("\0") || conflicts.test(value)) {
    throw new Error("repository text contains binary data or conflict markers");
  }
}

export function verifyRepository(root: string): void {
  const indexed = gitPaths(
    execFileSync("git", ["ls-files", "-z"], { cwd: root, timeout: 30_000 }),
  );
  if (indexed.length > 0) {
    verifyPathNames(indexed);
  }
  const names = [...new Set([...indexed, ...diskFiles(root, root)])];
  verifyPathNames(names);
  for (const name of names) {
    verifyTextKind(name);
    verifyText(readFileSync(join(root, name)));
  }
}
