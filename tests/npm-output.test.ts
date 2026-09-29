import { execFileSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { npmOutput } from "../quality/npm-output.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
test("captures bytes using the native npm CLI, structured arguments and deadline", () => {
  vi.stubEnv("npm_execpath", "/npm-cli.js");
  const bytes = Buffer.from([255, 0, 1]);
  vi.mocked(execFileSync).mockReturnValue(bytes);
  expect(npmOutput(["pack", "--json"], "/stage", 1234)).toBe(bytes);
  expect(execFileSync).toHaveBeenCalledExactlyOnceWith(
    process.execPath,
    ["/npm-cli.js", "pack", "--json"],
    { cwd: "/stage", timeout: 1234 },
  );
});
test.each([undefined, ""])(
  "missing npm CLI path %s fails before execution",
  (value) => {
    vi.stubEnv("npm_execpath", value);
    expect(() => {
      npmOutput(["pack"], "/stage", 1);
    }).toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
  },
);
test("capture propagates tool errors rather than returning a successful report", () => {
  vi.stubEnv("npm_execpath", "/npm-cli.js");
  vi.mocked(execFileSync).mockImplementationOnce(() => {
    throw new Error("native tool failed");
  });
  expect(() => {
    npmOutput(["pack"], "/stage", 1);
  }).toThrow("native tool failed");
});
