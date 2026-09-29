import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNpm } from "./commands.js";
import { npmOutput } from "./npm-output.js";
import { packReport, verifyPackage } from "./package-report.js";
import policy from "./package-policy.json" with { type: "json" };

export function verifyPackageBuild(root: string, timeout: number): void {
  const stage = mkdtempSync(join(tmpdir(), "relentless-public-build-"));
  try {
    for (const name of ["package.json", "README.md", "LICENSE"]) {
      copyFileSync(join(root, name), join(stage, name));
    }
    runNpm(
      ["run", "build", "--", "--outDir", join(stage, "dist")],
      root,
      timeout,
    );
    const expected = new Map(
      policy.files.map((name) => [name, readFileSync(join(stage, name))]),
    );
    const receipt = npmOutput(
      ["pack", "--ignore-scripts", "--json"],
      stage,
      timeout,
    );
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(receipt),
    );
    const archive = readFileSync(join(stage, packReport(value).filename));
    verifyPackage(value, archive, expected);
    const output = join(root, ".quality-results");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "package.tgz"), archive);
    writeFileSync(join(output, "package.json"), receipt);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
