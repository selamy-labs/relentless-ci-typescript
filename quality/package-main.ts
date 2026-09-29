import { verifyPackageBuild } from "./package-build.js";
import { readJson } from "./security.js";
import { z } from "zod";
import { join } from "node:path";

const root = process.cwd();
verifyPackageBuild(
  root,
  z
    .number()
    .int()
    .positive()
    .parse(readJson(join(root, "quality", "timeout.json"))),
);
