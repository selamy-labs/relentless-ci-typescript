import { extname, basename } from "node:path";

const forbidden = /[<>:"\\|?*]|\p{Control}/u;
const ending = /[.\s]$/u;
const device = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]) *(?:\.|$)/iu;
const textExtensions = new Set([
  ".ts",
  ".mjs",
  ".json",
  ".md",
  ".toml",
  ".lock",
  ".yml",
  ".yaml",
  ".txt",
  ".ignore",
]);
const textNames = new Set(["LICENSE", "CODEOWNERS", ".gitignore", ".npmrc"]);

function component(name: string): void {
  if (name.length === 0 || forbidden.test(name) || ending.test(name)) {
    throw new Error("repository path contains an unsupported component");
  }
  if (device.test(name)) {
    throw new Error("repository path uses a Windows device name");
  }
}

function prefixes(name: string): string[] {
  const parts = name.split("/");
  parts.forEach(component);
  return parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
}

/** Reject both whole-file collisions and different spellings of a shared directory. */
export function verifyPathNames(names: string[]): void {
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error("repository path inventory is empty or duplicated");
  }
  const seen = new Map<string, string>();
  for (const name of names) {
    for (const prefix of prefixes(name)) {
      remember(seen, prefix);
    }
  }
}

function remember(seen: Map<string, string>, prefix: string): void {
  const key = prefix.normalize("NFC").toUpperCase();
  const prior = seen.get(key);
  if (prior !== undefined && prior !== prefix) {
    throw new Error(
      "repository paths collide after Unicode/case normalization",
    );
  }
  seen.set(key, prefix);
}

/** This text-only template has no product binary assets or native extensions. */
export function verifyTextKind(name: string): void {
  if (name === "quality/verifier.Dockerfile") return;
  if (
    !textNames.has(basename(name)) &&
    !textExtensions.has(extname(name).toLowerCase())
  ) {
    throw new Error(
      "repository file kind is outside the protected text inventory",
    );
  }
}
