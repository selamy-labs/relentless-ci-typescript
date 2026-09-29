import { expect, test } from "vitest";
import { consumerNode } from "../quality/consumer-command.js";

test("native Node preserves stdin, stdout, stderr and the expected nonzero CLI status", () => {
  consumerNode(
    [
      "-e",
      "process.stdout.write(require('node:fs').readFileSync(0));process.stderr.write('expected error');process.exitCode=2;",
    ],
    process.cwd(),
    5000,
    "input with spaces\n",
    { status: 2, stdout: "input with spaces\n", stderr: "expected error" },
  );
});

test("native timeout and a wrong status cannot count as successful consumer checks", () => {
  expect(() => {
    consumerNode(["-e", "setTimeout(() => {}, 60000)"], process.cwd(), 20, "", {
      status: 0,
      stdout: "",
      stderr: "",
    });
  }).toThrow();
  expect(() => {
    consumerNode(["-e", "process.exit(3)"], process.cwd(), 5000, "", {
      status: 2,
      stdout: "",
      stderr: "",
    });
  }).toThrow("installed consumer status differs from its contract");
});
