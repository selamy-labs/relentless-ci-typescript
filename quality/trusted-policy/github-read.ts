/** Bind read-only native GitHub metadata to one trusted repository. */

import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { parseTree, type Node, type ParseError } from "jsonc-parser";

const MAX_BYTES = 8 * 1024 * 1024;
const VERSION = "X-GitHub-Api-Version: 2026-03-10";

export type Execute = typeof execFileSync;

export function repositoryRoute(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/u.test(value) ||
    value.endsWith("/.") ||
    value.endsWith("/..")
  ) {
    throw new Error("exact native owner/repository identity required");
  }
  return `repos/${value}`;
}

function safeSuffix(suffix: string): boolean {
  if (!/^[A-Za-z0-9_./-]+(?:\?per_page=100&page=[1-9][0-9]*)?$/u.test(suffix)) {
    return false;
  }
  const path = suffix.replace(/\?.*/u, "");
  return path
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

export function endpointPath(endpoint: unknown, repository: unknown): string {
  const root = repositoryRoute(repository);
  if (endpoint === root) return root;
  if (typeof endpoint !== "string" || !endpoint.startsWith(`${root}/`)) {
    throw new Error("native read must stay within the trusted repository");
  }
  if (!safeSuffix(endpoint)) {
    throw new Error("unsupported native metadata route or query");
  }
  return endpoint;
}

function assertObjectKeys(node: Node): void {
  if (node.type !== "object") return;
  const keys = new Set<string>();
  const properties = (node as Node & { children: Node[] }).children;
  for (const property of properties) {
    const key = property.children?.[0]?.value as string;
    if (keys.has(key)) {
      throw new Error("native metadata contains duplicate object keys");
    }
    keys.add(key);
  }
}

function uniqueKeys(node: Node): void {
  assertObjectKeys(node);
  if (node.children === undefined) return;
  for (const child of node.children) uniqueKeys(child);
}

function requiredTree(node: Node | undefined): Node {
  if (node === undefined) throw new Error("native metadata is invalid JSON");
  return node;
}

export function decodeResponse(bytes: Uint8Array): unknown {
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("native metadata response exceeded byte budget");
  }
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const errors: ParseError[] = [];
  const tree = requiredTree(
    parseTree(source, errors, { disallowComments: true }),
  );
  uniqueKeys(tree);
  if (errors.length > 0) {
    throw new Error("native metadata is invalid JSON");
  }
  const value: unknown = JSON.parse(source, (_key: string, item: unknown) => {
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw new Error("native metadata contains a nonfinite number");
    }
    return item;
  });
  return value;
}

export function githubApi(
  executable: string,
  repository: string,
  execute: Execute = execFileSync,
): (route: string) => unknown {
  repositoryRoute(repository);
  if (!isAbsolute(executable)) {
    throw new Error("trusted GitHub CLI needs an absolute executable path");
  }
  return (route) => {
    const path = endpointPath(route, repository);
    const bytes = execute(
      executable,
      [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        "-H",
        VERSION,
        path,
      ],
      { timeout: 30_000, maxBuffer: MAX_BYTES + 1 },
    );
    return decodeResponse(bytes);
  };
}
