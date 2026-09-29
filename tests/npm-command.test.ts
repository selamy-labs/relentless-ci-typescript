import { execFileSync } from "node:child_process";
import { expect, test, vi, afterEach } from "vitest";
import { runNpm } from "../quality/commands.js";
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test("executes npm's actual CLI with Node, avoiding platform shell wrappers", () => {
  vi.stubEnv("npm_execpath", "/installed/npm-cli.js");
  runNpm(["run", "coverage"], "/repository", 5000);
  expect(execFileSync).toHaveBeenCalledExactlyOnceWith(
    process.execPath,
    ["/installed/npm-cli.js", "run", "coverage"],
    { cwd: "/repository", timeout: 5000, stdio: "inherit" },
  );
});

test.each([undefined, ""])(
  "fails if npm's CLI path is unavailable: %s",
  (value) => {
    vi.stubEnv("npm_execpath", value);
    expect(() => {
      runNpm(["run", "coverage"], "/repository", 5000);
    }).toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
  },
);
