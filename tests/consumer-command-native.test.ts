import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("native preload binds direct CommonJS and ESM network exports to the denial", () => {
  const code = `
    import tls, {connect as tlsConnect} from 'node:tls';
    import http, {request as httpRequest, get as httpGet} from 'node:http';
    import https, {request as httpsRequest, get as httpsGet} from 'node:https';
    const denied=globalThis.fetch;
    for(const value of [tls.connect,tlsConnect,http.request,httpRequest,http.get,httpGet,https.request,httpsRequest,https.get,httpsGet]){
      if(value!==denied) throw new Error('direct network binding is not denied');
    }
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code],
    {
      env: consumerEnvironment(tmpdir()),
      encoding: "utf8",
      timeout: 5000,
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
});

test.each([
  "require('node:fs').writeFileSync(process.argv[1],'outside')",
  "require('node:fs').openSync(process.argv[1],'w')",
  "require('node:fs').mkdirSync(process.argv[1])",
  "require('node:fs').promises.writeFile(process.argv[1],'outside').catch(error=>{throw error})",
])("native installed-consumer guard blocks outside write %s", (code) => {
  const owned = mkdtempSync(join(tmpdir(), "relentless-c11-owned-"));
  const foreign = mkdtempSync(join(tmpdir(), "relentless-c11-foreign-"));
  const outside = join(foreign, "outside");
  try {
    const result = spawnSync(process.execPath, ["-e", code, outside], {
      cwd: owned,
      env: consumerEnvironment(owned),
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "installed consumer write outside temporary root denied",
    );
    expect(existsSync(outside)).toBe(false);
  } finally {
    rmSync(owned, { recursive: true, force: true });
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("native installed-consumer guard permits an owned write", () => {
  const owned = mkdtempSync(join(tmpdir(), "relentless-c11-owned-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["-e", "require('node:fs').writeFileSync('inside','ok')"],
      {
        cwd: owned,
        env: consumerEnvironment(owned),
        encoding: "utf8",
        timeout: 5000,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(readFileSync(join(owned, "inside"), "utf8")).toBe("ok");
  } finally {
    rmSync(owned, { recursive: true, force: true });
  }
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
