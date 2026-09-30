import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const versions = {
  22: "22.23.2",
  24: "24.19.0",
  26: "26.4.0",
} as const;
const dockerTimeout = 7_200_000;
const buildTimeout = 600_000;
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

export function buildImage(root: string): string {
  const dockerfile = readFileSync(join(root, "quality", "verifier.Dockerfile"));
  const digest = createHash("sha256").update(dockerfile).digest("hex");
  const tag = `relentless-ci-verifier:${digest}`;
  const result = spawnSync("docker", ["build", "--pull", "--tag", tag, "-"], {
    cwd: root,
    input: dockerfile,
    stdio: ["pipe", "inherit", "inherit"],
    timeout: buildTimeout,
  });
  requireSuccess(result, "Docker image build");
  return tag;
}

export function containerArguments(
  root: string,
  cache: string,
  name: string,
  major: number,
  uid: number,
  gid: number,
  runtimeImage: string,
): string[] {
  return [
    "run",
    "--name=" + name,
    "--read-only",
    `--tmpfs=/tmp:rw,exec,nosuid,nodev,uid=${String(uid)},gid=${String(gid)}`,
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
    runtimeImage,
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
  const runtimeImage = buildImage(root);
  const args = containerArguments(
    root,
    cache,
    name,
    major,
    process.getuid(),
    process.getgid(),
    runtimeImage,
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
