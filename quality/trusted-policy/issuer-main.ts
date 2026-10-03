/** Execute the trusted issuer only from its protected Linux workflow. */

import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { main } from "./issuer-entrypoint.js";

if (process.argv.length !== 2) {
  throw new Error("trusted issuer accepts no PR-controlled arguments");
}
const executable = execFileSync("which", ["gh"], {
  encoding: "utf8",
  timeout: 30_000,
}).trim();
if (!isAbsolute(executable)) {
  throw new Error("trusted GitHub CLI path is not absolute");
}
await main(process.env, executable);
