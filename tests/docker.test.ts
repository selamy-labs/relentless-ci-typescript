import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  containerArguments,
  removeContainer,
  runDockerVerifier,
  runtimeVersion,
} from "../quality/docker.js";
import { temporaryDirectories } from "./temporary-directory.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const native = vi.mocked(spawnSync);
const repository = temporaryDirectories("relentless-docker-runner-");

function result(status: number, stderr = "") {
  return { pid: 1, output: [], stdout: "", stderr, status, signal: null };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

test.each([
  [22, "22.23.2"],
  [24, "24.19.0"],
  [26, "26.4.0"],
])("pins declared Node %i to %s inside Docker", (major, version) => {
  expect(runtimeVersion(major)).toBe(version);
});

test.each([0, 23, 27, Number.NaN])(
  "rejects unsupported container runtime %s",
  (major) => {
    expect(() => runtimeVersion(major)).toThrow();
  },
);

test("launches an isolated non-root container without host sockets or secrets", () => {
  const args = containerArguments(
    "/repository",
    "/cache",
    "owned-unit",
    24,
    1001,
    1002,
  );
  expect(args).toContain("--read-only");
  expect(args).toContain("--cap-drop=ALL");
  expect(args).toContain("--security-opt=no-new-privileges");
  expect(args).toContain("--user=1001:1002");
  expect(args).toContain("--mount=type=bind,src=/repository,dst=/workspace");
  expect(args).toContain("--mount=type=bind,src=/cache,dst=/mise-data");
  expect(args).toContain("node@24.19.0");
  expect(args.join(" ")).not.toContain("docker.sock");
  expect(args.join(" ")).not.toContain("GH_TOKEN");
  expect(args.join(" ")).not.toContain("--privileged");
});

test("removes only the named container and requires absent readback", () => {
  native.mockImplementation((_command, args) =>
    args?.[0] === "rm" ? result(0) : result(1, "No such object"),
  );
  expect(() => {
    removeContainer("owned-unit");
  }).not.toThrow();
  expect(native.mock.calls.map((call) => call[1])).toEqual([
    ["rm", "-f", "owned-unit"],
    ["inspect", "owned-unit"],
  ]);
});

test("a missing pre-creation container is acceptable only with absent readback", () => {
  native.mockImplementation((_command, args) =>
    args?.[0] === "rm"
      ? result(1, "No such container")
      : result(1, "No such object"),
  );
  expect(() => {
    removeContainer("owned-unit");
  }).not.toThrow();
});

test("accepts the lowercase absence report from native Docker", () => {
  native.mockImplementation((_command, args) =>
    args?.[0] === "rm"
      ? result(1, "error: no such container: owned-unit")
      : result(1, "error: no such object: owned-unit"),
  );
  expect(() => {
    removeContainer("owned-unit");
  }).not.toThrow();
});

test.each([
  [result(1, "permission denied"), result(1, "No such object")],
  [result(0), result(0)],
  [result(0), result(1, "daemon unavailable")],
])("fails closed on incomplete Docker cleanup", (remove, inspect) => {
  native.mockImplementation((_command, args) =>
    args?.[0] === "rm" ? remove : inspect,
  );
  expect(() => {
    removeContainer("owned-unit");
  }).toThrow();
});

test.each([0, 9])(
  "always cleans an owned container after Docker exit %i",
  (status) => {
    const root = repository();
    const cache = join(root, "cache");
    native.mockImplementation((_command, args) => {
      if (args?.[0] === "run") return result(status);
      if (args?.[0] === "rm") return result(0);
      return result(1, "No such object");
    });
    if (status === 0) {
      expect(() => {
        runDockerVerifier(root, 22, cache);
      }).not.toThrow();
    } else {
      expect(() => {
        runDockerVerifier(root, 22, cache);
      }).toThrow("Docker verifier failed");
    }
    expect(native.mock.calls.map((call) => call[1]?.[0])).toEqual([
      "run",
      "rm",
      "inspect",
    ]);
  },
);

test("propagates a Docker launch error after removing the owned container", () => {
  const root = repository();
  const failure = new Error("Docker daemon unavailable");
  native.mockImplementation((_command, args) => {
    if (args?.[0] === "run") return { ...result(1), error: failure };
    if (args?.[0] === "rm") return result(0);
    return result(1, "No such object");
  });
  expect(() => {
    runDockerVerifier(root, 22, join(root, "cache"));
  }).toThrow(failure);
  expect(native.mock.calls.map((call) => call[1]?.[0])).toEqual([
    "run",
    "rm",
    "inspect",
  ]);
});

test.each(["rm", "inspect"])(
  "propagates a native %s cleanup error",
  (operation) => {
    native.mockImplementation((_command, args) => {
      if (args?.[0] === operation) {
        return { ...result(1), error: new Error(`${operation} failed`) };
      }
      return args?.[0] === "rm" ? result(0) : result(1, "No such object");
    });
    expect(() => {
      removeContainer("owned-unit");
    }).toThrow(`${operation} failed`);
  },
);

test("requires a Linux user identity before starting Docker", () => {
  const root = repository();
  vi.stubGlobal("process", { ...process, getuid: undefined });
  expect(() => {
    runDockerVerifier(root, 22, join(root, "cache"));
  }).toThrow("Linux user identity is required");
  expect(native).not.toHaveBeenCalled();
});
