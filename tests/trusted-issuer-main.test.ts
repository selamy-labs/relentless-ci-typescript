import { execFileSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { main } from "../quality/trusted-policy/issuer-entrypoint.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("../quality/trusted-policy/issuer-entrypoint.js", () => ({
  main: vi.fn(),
}));

const originalArgs = process.argv;

afterEach(() => {
  process.argv = originalArgs;
  vi.resetModules();
  vi.clearAllMocks();
});

test("rejects extra untrusted arguments before invoking GitHub", async () => {
  process.argv = ["node", "issuer-main.js", "smoke"];
  await expect(
    import("../quality/trusted-policy/issuer-main.js"),
  ).rejects.toThrow("no PR-controlled arguments");
  expect(execFileSync).not.toHaveBeenCalled();
});

test("rejects a relative GitHub CLI path", async () => {
  process.argv = ["node", "issuer-main.js"];
  vi.mocked(execFileSync).mockReturnValue("gh");
  await expect(
    import("../quality/trusted-policy/issuer-main.js"),
  ).rejects.toThrow("not absolute");
  expect(main).not.toHaveBeenCalled();
});

test("invokes the protected entrypoint with the absolute CLI", async () => {
  process.argv = ["node", "issuer-main.js"];
  vi.mocked(execFileSync).mockReturnValue("/trusted/gh\n");
  vi.mocked(main).mockResolvedValue(77);
  await import("../quality/trusted-policy/issuer-main.js");
  expect(execFileSync).toHaveBeenCalledWith("which", ["gh"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(main).toHaveBeenCalledWith(process.env, "/trusted/gh");
});
