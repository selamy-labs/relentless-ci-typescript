import { join } from "node:path";
import { z } from "zod";
import { runNpm } from "./commands.js";
import { readJson, verifySecurity } from "./security.js";
import { verifySources, verifyTracked } from "./source-scope.js";

const registry = z.array(z.array(z.string().min(1)).min(1)).min(1);
const deadline = z.number().int().positive();

export function verify(root: string): void {
  const timeout = deadline.parse(
    readJson(join(root, "quality", "timeout.json")),
  );
  verifySources(root);
  verifyTracked(root);
  const checks = registry.parse(readJson(join(root, "quality", "checks.json")));
  for (const arguments_ of checks) {
    runNpm(arguments_, root, timeout);
  }
  verifySecurity(root, timeout);
  runNpm(["run", "mutation"], root, timeout);
}
