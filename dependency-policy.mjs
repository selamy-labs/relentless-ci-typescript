import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { URL } from "node:url";

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("dependency policy requires an object");
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @returns {string} */
function text(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("dependency policy requires nonempty strings");
  }
  return value;
}

/** @param {string} root @param {string} name @returns {unknown} */
function read(root, name) {
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(join(root, name)),
    ),
  );
}

/** @param {unknown} value @returns {string[]} */
function strings(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("dependency policy requires a nonempty array");
  }
  return value.map(text);
}

/** @param {unknown} value @returns {boolean} */
function flag(value) {
  if (value === undefined) return false;
  if (typeof value !== "boolean")
    throw new Error("dependency flags must be boolean");
  return value;
}

/** @param {string} value */
function integrity(value) {
  const prefix = "sha512-";
  const digest = value.slice(prefix.length);
  const bytes = Buffer.from(digest, "base64");
  if (
    !value.startsWith(prefix) ||
    bytes.length !== 64 ||
    bytes.toString("base64") !== digest
  ) {
    throw new Error(
      "every registry dependency requires canonical SHA-512 integrity",
    );
  }
}

/** @param {string} value @param {string[]} origins */
function origin(value, origins) {
  const url = new URL(value);
  if (
    !origins.includes(url.origin) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.pathname.endsWith(".tgz")
  ) {
    throw new Error("dependency tarball must use an approved registry URL");
  }
}

/** @param {unknown} value @returns {string} */
function declarations(value) {
  return JSON.stringify(
    Object.entries(record(value)).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** @param {Record<string, unknown>} manifest @param {Record<string, unknown>} locked */
function manifestMatches(manifest, locked) {
  for (const field of ["name", "version", "license"]) {
    same(
      text(manifest[field]),
      text(locked[field]),
      "manifest identity differs from locked root package",
    );
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    same(
      declarations(manifest[field] ?? {}),
      declarations(locked[field] ?? {}),
      "manifest dependencies differ from locked declarations",
    );
  }
}

/** @param {string} actual @param {string} expected @param {string} message */
function same(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

/** @param {string} path @param {string} version @param {string} hash @param {Record<string, unknown>} policy */
function script(path, version, hash, policy) {
  const reviewed = record(policy.reviewedInstallScripts);
  same(
    text(reviewed[path]),
    JSON.stringify([version, hash]),
    `dependency install script requires review: ${path}`,
  );
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} item
 * @param {Record<string, unknown>} policy
 */
function component(path, item, policy) {
  if (!path.startsWith("node_modules/") || flag(item.link)) {
    throw new Error("only registry dependencies are supported");
  }
  const version = text(item.version);
  const license = text(item.license);
  const resolved = text(item.resolved);
  const hash = text(item.integrity);
  const development = flag(item.dev);
  const allowed = strings(
    development ? policy.developmentLicenses : policy.runtimeLicenses,
  );
  if (!allowed.includes(license)) {
    throw new Error(`dependency license requires review: ${path}: ${license}`);
  }
  origin(resolved, strings(policy.registryOrigins));
  integrity(hash);
  if (flag(item.hasInstallScript)) {
    script(path, version, hash, policy);
  }
  return { path, version, license, resolved, integrity: hash, development };
}

/** Validate all locked packages, including optional packages absent on this OS.
 * @param {string} root
 */
export function dependencies(root) {
  if (existsSync(join(root, "npm-shrinkwrap.json"))) {
    throw new Error("npm shrinkwrap cannot override the audited lockfile");
  }
  const policy = record(read(root, "quality/dependency-policy.json"));
  const lock = record(read(root, "package-lock.json"));
  if (lock.lockfileVersion !== 3) {
    throw new Error("dependency policy requires lockfile version 3");
  }
  const packages = record(lock.packages);
  const manifest = record(read(root, "package.json"));
  manifestMatches(manifest, record(packages[""]));
  same(
    text(manifest.license),
    text(policy.projectLicense),
    "project license differs from approved policy",
  );
  const entries = Object.entries(packages).filter(([path]) => path !== "");
  if (entries.length === 0) {
    throw new Error("locked dependency inventory is empty");
  }
  return entries.map(([path, item]) => component(path, record(item), policy));
}
