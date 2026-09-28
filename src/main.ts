#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { run } from "./cli.js";

const result = run(readFileSync(0, "utf8"));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;
