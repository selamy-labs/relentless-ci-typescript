import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { diskFiles } from "./repository-hygiene.js";
import { verifyJson, verifyToml, verifyYaml } from "./support-formats.js";

const parsers = new Map([
  [".json", verifyJson],
  [".yml", verifyYaml],
  [".yaml", verifyYaml],
  [".toml", verifyToml],
]);

function format(name: string): string {
  return basename(name) === "mise.lock" ? ".toml" : extname(name).toLowerCase();
}

export function verifySupportFiles(root: string): void {
  const checked: string[] = [];
  for (const name of diskFiles(root, root)) {
    const parser = parsers.get(format(name));
    if (parser === undefined) {
      continue;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(join(root, name)),
    );
    parser(text);
    checked.push(name);
  }
  z.array(z.string()).min(1).parse(checked);
}
