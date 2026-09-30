import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const image =
  "ghcr.io/jdx/mise:2026.9.17-debian@sha256:96b00319506c7ae46d2a561ba7da60723c723327d796334847c2802827cc6ec5";
const versions = {
  22: "22.23.2",
  24: "24.19.0",
  26: "26.4.0",
} as const;
const dockerTimeout = 7_200_000;
type NativeResult = ReturnType<typeof spawnSync>;

function requireSuccess(result: NativeResult, purpose: string): void {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${purpose} failed: ${String(result.status)}`);
  }
}

export function runtimeVersion(major: number): string {
  const supported = z.union([z.literal(22), z.literal(24), z.literal(26)]);
  return versions[supported.parse(major)];
}

export function containerArguments(
  root: string,
  cache: string,
  name: string,
  major: number,
  uid: number,
  gid: number,
): string[] {
  return [
    "run",
    "--name=" + name,
    "--read-only",
    `--tmpfs=/tmp:rw,nosuid,nodev,uid=${String(uid)},gid=${String(gid)}`,
    "--pids-limit=512",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    `--user=${String(uid)}:${String(gid)}`,
    "--env=HOME=/tmp",
    "--env=MISE_DATA_DIR=/mise-data",
    "--env=MISE_CACHE_DIR=/mise-data/cache",
    "--env=MISE_STATE_DIR=/mise-data/state",
    `--mount=type=bind,src=${root},dst=/workspace`,
    `--mount=type=bind,src=${cache},dst=/mise-data`,
    "--workdir=/workspace",
    "--entrypoint=/usr/local/bin/mise",
    image,
    "exec",
    "--yes",
    `node@${runtimeVersion(major)}`,
    "--",
    "node",
    ".quality-build/quality/container-guardian-main.js",
  ];
}

export function removeContainer(name: string): void {
  const result = spawnSync("docker", ["rm", "-f", name], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !/no such container/iu.test(result.stderr)) {
    throw new Error("owned Docker container cleanup failed");
  }
  const after = spawnSync("docker", ["inspect", name], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (after.error) throw after.error;
  if (after.status !== 1 || !/no such object/iu.test(after.stderr)) {
    throw new Error("owned Docker container remains after cleanup");
  }
}

export function runDockerVerifier(
  root: string,
  major: number,
  cache: string = join(homedir(), ".cache", "relentless-ci", "mise"),
): void {
  if (!process.getuid || !process.getgid) {
    throw new Error("Linux user identity is required for Docker isolation");
  }
  const name = `relentless-ci-${randomUUID().replaceAll("-", "")}`;
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const args = containerArguments(
    root,
    cache,
    name,
    major,
    process.getuid(),
    process.getgid(),
  );
  try {
    const result = spawnSync("docker", args, {
      cwd: root,
      stdio: "inherit",
      timeout: dockerTimeout,
    });
    requireSuccess(result, "Docker verifier");
  } finally {
    removeContainer(name);
  }
}
