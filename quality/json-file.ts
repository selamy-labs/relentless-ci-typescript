import { readFileSync } from "node:fs";

export function readJson(path: string): unknown {
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path)),
  );
}
