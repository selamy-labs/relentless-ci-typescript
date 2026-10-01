import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  consumerEnvironment,
  consumerNode,
} from "../quality/consumer-command.js";

test.each([
  "fetch('http://127.0.0.1:9')",
  "require('node:net').connect(9,'127.0.0.1')",
  "require('node:tls').connect(9,'127.0.0.1')",
  "require('node:http').get('http://127.0.0.1:9')",
  "require('node:https').get('https://127.0.0.1:9')",
  "require('node:dgram').createSocket('udp4').send(Buffer.from('x'),9,'127.0.0.1')",
])("native installed-consumer guard blocks network call %s", (code) => {
  const result = spawnSync(process.execPath, ["-e", code], {
    env: consumerEnvironment(tmpdir()),
    encoding: "utf8",
    timeout: 5000,
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("installed consumer network access denied");
});

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
