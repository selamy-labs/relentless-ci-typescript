import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { dependencies } from "./dependency-policy.mjs";

const root = process.cwd();
const directory = join(root, ".quality-results");
const report = join(directory, "component-inventory.json");
mkdirSync(directory, { recursive: true });
rmSync(report, { force: true });
writeFileSync(report, JSON.stringify(dependencies(root), null, 2) + "\n");
