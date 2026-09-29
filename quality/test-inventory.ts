import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

function inventory(paths: string[], root: string): string {
  const canonical = paths.map((name) => realpathSync(resolve(root, name)));
  if (new Set(canonical).size !== canonical.length) {
    throw new Error("duplicate test suite paths");
  }
  return JSON.stringify(canonical.sort());
}

export function verifyInventory(
  actual: string[],
  expected: string[],
  root: string,
): void {
  if (inventory(actual, root) !== inventory(expected, root)) {
    throw new Error("test suite inventory is incomplete");
  }
}

export function testSources(root: string, sources: string[]): string[] {
  return sources.filter((path) =>
    /^tests\/.*\.test\.ts$/u.test(relative(root, path).split(sep).join("/")),
  );
}
