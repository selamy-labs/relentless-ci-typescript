import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { dependencies } from "../dependency-policy.mjs";

const roots: string[] = [];
const hash = "sha512-" + Buffer.alloc(64).toString("base64");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "relentless-dependencies-"));
  roots.push(root);
  const manifest: Record<string, unknown> = {
    name: "example",
    version: "1.0.0",
    license: "MIT",
  };
  const item: Record<string, unknown> = {
    version: "1.0.0",
    license: "MIT",
    resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
    integrity: hash,
  };
  const packages: Record<string, unknown> = {
    "": { ...manifest },
    "node_modules/example": item,
  };
  const lock: Record<string, unknown> = { lockfileVersion: 3, packages };
  const policy: Record<string, unknown> = {
    registryOrigins: ["https://registry.npmjs.org"],
    runtimeLicenses: ["MIT"],
    developmentLicenses: ["MIT", "LGPL-3.0-only"],
    reviewedInstallScripts: {},
    projectLicense: "MIT",
  };
  function save(): void {
    mkdirSync(join(root, "quality"), { recursive: true });
    for (const [name, value] of Object.entries({
      "package.json": manifest,
      "package-lock.json": lock,
      "quality/dependency-policy.json": policy,
    })) {
      writeFileSync(join(root, name), JSON.stringify(value));
    }
  }
  save();
  return { root, manifest, item, packages, lock, policy, save };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("clean full-lock inventory returns exact component metadata", () => {
  const f = fixture();
  expect(dependencies(f.root)).toEqual([
    {
      path: "node_modules/example",
      version: "1.0.0",
      license: "MIT",
      resolved: f.item.resolved,
      integrity: hash,
      development: false,
    },
  ]);
  f.item.dev = true;
  f.item.license = "LGPL-3.0-only";
  f.item.link = false;
  f.item.hasInstallScript = false;
  f.packages["node_modules/parent/node_modules/example"] = {
    ...f.item,
    version: "2.0.0",
  };
  f.save();
  expect(
    dependencies(f.root).map((item) => [
      item.path,
      item.version,
      item.development,
    ]),
  ).toEqual([
    ["node_modules/example", "1.0.0", true],
    ["node_modules/parent/node_modules/example", "2.0.0", true],
  ]);
});

test.each([
  ["license", "UNKNOWN", "license requires review"],
  ["license", "LGPL-3.0-only", "license requires review"],
  ["link", true, "only registry dependencies"],
  ["dev", "true", "flags must be boolean"],
  ["hasInstallScript", 1, "flags must be boolean"],
  ["version", "", "nonempty strings"],
  ["license", null, "nonempty strings"],
  ["resolved", false, "nonempty strings"],
  ["integrity", [], "nonempty strings"],
])(
  "rejects malformed or unapproved component %s=%j",
  (field, value, message) => {
    const f = fixture();
    f.item[field] = value;
    f.save();
    expect(() => dependencies(f.root)).toThrow(message);
  },
);

test.each([
  "http://registry.npmjs.org/example.tgz",
  "https://other.example/example.tgz",
  "https://registry.npmjs.org.evil.example/example.tgz",
  "https://user@registry.npmjs.org/example.tgz",
  "https://:password@registry.npmjs.org/example.tgz",
  "https://registry.npmjs.org/example.tgz?query=1",
  "https://registry.npmjs.org/example.tgz#fragment",
  "https://registry.npmjs.org/example.zip",
  "file:///tmp/example.tgz",
])("rejects unapproved tarball URL %s", (url) => {
  const f = fixture();
  f.item.resolved = url;
  f.save();
  expect(() => dependencies(f.root)).toThrow("approved registry URL");
});

test.each([
  "sha1-" + Buffer.alloc(64).toString("base64"),
  "sha512-" + Buffer.alloc(63).toString("base64"),
  "sha512-" + Buffer.alloc(65).toString("base64"),
  hash.replace(/A==$/u, "B=="),
  hash + " ",
  "sha512-broken",
])("rejects missing or noncanonical SHA-512 integrity %s", (value) => {
  const f = fixture();
  f.item.integrity = value;
  f.save();
  expect(() => dependencies(f.root)).toThrow("canonical SHA-512 integrity");
});

test("script declarations require exact reviewed version and integrity", () => {
  const f = fixture();
  f.item.hasInstallScript = true;
  f.save();
  expect(() => dependencies(f.root)).toThrow();
  f.policy.reviewedInstallScripts = {
    "node_modules/example": JSON.stringify(["1.0.0", hash]),
  };
  f.save();
  expect(dependencies(f.root)).toHaveLength(1);
  f.item.version = "2.0.0";
  f.save();
  expect(() => dependencies(f.root)).toThrow("install script requires review");
  f.item.version = "1.0.0";
  f.item.integrity = "sha512-" + Buffer.alloc(64, 1).toString("base64");
  f.save();
  expect(() => dependencies(f.root)).toThrow("install script requires review");
});

test("root identity and all direct declaration classes match the manifest", () => {
  const f = fixture();
  const identity = { ...f.manifest };
  for (const field of ["name", "version", "license"]) {
    f.manifest[field] = "changed";
    f.save();
    expect(() => dependencies(f.root)).toThrow("manifest identity differs");
    f.manifest[field] = identity[field];
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    f.manifest[field] = { second: "2", first: "1" };
    f.save();
    expect(() => dependencies(f.root)).toThrow("manifest dependencies differ");
    f.packages[""] = { ...f.manifest, [field]: { first: "1", second: "2" } };
    f.save();
    expect(dependencies(f.root)).toHaveLength(1);
  }
  f.policy.projectLicense = "ISC";
  f.save();
  expect(() => dependencies(f.root)).toThrow("project license differs");
});

test("missing, malformed and empty lock or policy cannot pass", () => {
  const f = fixture();
  f.lock.lockfileVersion = 2;
  f.save();
  expect(() => dependencies(f.root)).toThrow("lockfile version 3");
  f.lock.lockfileVersion = 3;
  delete f.packages["node_modules/example"];
  f.save();
  expect(() => dependencies(f.root)).toThrow("inventory is empty");
  f.packages["elsewhere/example"] = f.item;
  f.save();
  expect(() => dependencies(f.root)).toThrow("only registry dependencies");
  for (const value of [null, [], 1]) {
    f.lock.packages = value;
    f.save();
    expect(() => dependencies(f.root)).toThrow("requires an object");
  }
  rmSync(join(f.root, "package-lock.json"));
  expect(() => dependencies(f.root)).toThrow();
});

test.each([[], null, {}])(
  "malformed license policy array %j fails",
  (value) => {
    const f = fixture();
    f.policy.runtimeLicenses = value;
    f.save();
    expect(() => dependencies(f.root)).toThrow("requires a nonempty array");
  },
);

test.each([false, true])(
  "entry point creates fresh receipt (stale=%s)",
  async (stale) => {
    const f = fixture();
    mkdirSync(join(f.root, ".quality-results"));
    const report = join(f.root, ".quality-results/component-inventory.json");
    if (stale) writeFileSync(report, "stale");
    vi.spyOn(process, "cwd").mockReturnValue(f.root);
    vi.resetModules();
    await import("../dependency-main.mjs");
    expect(readFileSync(report, "utf8")).toBe(
      JSON.stringify(dependencies(f.root), null, 2) + "\n",
    );
  },
);

test.each([false, true])(
  "bootstrap runs without installed dependencies (defect=%s)",
  (defect) => {
    const f = fixture();
    for (const name of ["dependency-policy.mjs", "dependency-main.mjs"]) {
      copyFileSync(name, join(f.root, name));
    }
    if (defect) {
      f.item.resolved = "https://unapproved.example/package.tgz";
      f.save();
    }
    const result = spawnSync(process.execPath, ["dependency-main.mjs"], {
      cwd: f.root,
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(defect ? 1 : 0);
    expect(existsSync(join(f.root, "node_modules"))).toBe(false);
    expect(
      existsSync(join(f.root, ".quality-results/component-inventory.json")),
    ).toBe(!defect);
  },
);

test("policy string elements cannot be empty", () => {
  const f = fixture();
  f.policy.runtimeLicenses = [""];
  f.save();
  expect(() => dependencies(f.root)).toThrow("requires nonempty strings");
});

test("invalid UTF-8 must fail rather than replace unrecognized bytes", () => {
  const f = fixture();
  for (const name of [
    "package.json",
    "package-lock.json",
    "quality/dependency-policy.json",
  ]) {
    f.save();
    const path = join(f.root, name);
    const raw = readFileSync(path, "utf8");
    writeFileSync(
      path,
      Buffer.concat([
        Buffer.from(raw.slice(0, -1) + ',"unused":"'),
        Buffer.from([255]),
        Buffer.from('"}'),
      ]),
    );
    expect(() => dependencies(f.root)).toThrow("encoded data");
  }
});

test("npm shrinkwrap cannot replace the checked dependency inventory", () => {
  const f = fixture();
  writeFileSync(join(f.root, "npm-shrinkwrap.json"), "{}");
  expect(() => dependencies(f.root)).toThrow("shrinkwrap cannot override");
});
