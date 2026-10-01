import { spawnSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import {
  consumerEnvironment,
  consumerNode,
} from "../quality/consumer-command.js";
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
test("installed behavior gets only platform plumbing and a temporary home", () => {
  vi.stubEnv("RLCI_PRODUCTION_SECRET", "private");
  const env = consumerEnvironment("/consumer");
  expect(env.RLCI_PRODUCTION_SECRET).toBeUndefined();
  expect(env.HOME).toBe("/consumer");
  expect(env.USERPROFILE).toBe("/consumer");
  expect(env.TMPDIR).toBe("/consumer");
  expect(env.NODE_OPTIONS).toMatch(/^--import=data:text\/javascript;base64,/u);
});
test("optional platform plumbing is copied only when present", () => {
  vi.stubEnv("PATHEXT", ".EXE;.CMD");
  expect(consumerEnvironment("/consumer").PATHEXT).toBe(".EXE;.CMD");
  vi.stubEnv("PATHEXT", undefined);
  expect(Object.hasOwn(consumerEnvironment("/consumer"), "PATHEXT")).toBe(
    false,
  );
});
test("uses structured Node arguments and validates all three process outputs", () => {
  vi.mocked(spawnSync).mockReturnValue({
    status: 0,
    signal: null,
    stdout: "answer\n",
    stderr: "",
    pid: 1,
    output: [],
  });
  consumerNode(
    ["--input-type=module", "-e", "code", "argument with spaces"],
    "/consumer",
    1234,
    "stdin",
    { status: 0, stdout: "answer\n", stderr: "" },
  );
  expect(spawnSync).toHaveBeenCalledExactlyOnceWith(
    process.execPath,
    ["--input-type=module", "-e", "code", "argument with spaces"],
    {
      cwd: "/consumer",
      timeout: 1234,
      input: "stdin",
      encoding: "utf8",
      env: consumerEnvironment("/consumer"),
    },
  );
});
test.each([
  { status: 2, stdout: "answer\n", stderr: "" },
  { status: 0, stdout: "wrong", stderr: "" },
  { status: 0, stdout: "answer\n", stderr: "warning" },
  { status: null, stdout: "answer\n", stderr: "" },
  {
    status: 0,
    stdout: "answer\n",
    stderr: "",
    error: new Error("tool failed"),
  },
  { status: 0, stdout: "answer\n", stderr: "", signal: "SIGTERM" },
])("a partial or mismatched process outcome cannot pass %j", (value) => {
  vi.mocked(spawnSync).mockReturnValue({
    signal: null,
    pid: 1,
    output: [],
    ...value,
  } as ReturnType<typeof spawnSync>);
  expect(() => {
    consumerNode([], "/consumer", 1, "", {
      status: 0,
      stdout: "answer\n",
      stderr: "",
    });
  }).toThrow();
});
