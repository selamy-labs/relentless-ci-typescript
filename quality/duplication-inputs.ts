import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { verifySources } from "./source-scope.js";

export function duplicationInputs(root: string): Map<string, Buffer> {
  const entries = verifySources(root).map((path) => {
    const bytes = readFileSync(path);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/jscpd\s*:\s*ignore-(?:start|end)/iu.test(text)) {
      throw new Error("inline duplication suppression is unsupported");
    }
    return [relative(root, path), bytes] as const;
  });
  return new Map(entries);
}

export function stageDuplicationInputs(
  inputs: Map<string, Buffer>,
  stage: string,
): string[] {
  return [...inputs].map(([name, bytes]) => {
    const path = join(stage, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  });
}

export function verifyDuplicationInputs(
  before: Map<string, Buffer>,
  after: Map<string, Buffer>,
): void {
  const changed = [...before].some(([path, bytes]) => {
    const current = after.get(path);
    return current === undefined || !bytes.equals(current);
  });
  if (before.size !== after.size || changed) {
    throw new Error("authored inputs changed during duplication scan");
  }
}
