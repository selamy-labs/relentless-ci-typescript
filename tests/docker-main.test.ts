import { afterEach, expect, test, vi } from "vitest";
import { runNpm } from "../quality/commands.js";
import { runDockerVerifier } from "../quality/docker.js";

vi.mock("../quality/commands.js", () => ({ runNpm: vi.fn() }));
vi.mock("../quality/docker.js", () => ({ runDockerVerifier: vi.fn() }));
const platform = Object.getOwnPropertyDescriptor(process, "platform");

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  if (platform) Object.defineProperty(process, "platform", platform);
});

test("Linux full verifier uses the isolated container", async () => {
  await import("../quality/docker-main.js");
  expect(runDockerVerifier).toHaveBeenCalledExactlyOnceWith(
    process.cwd(),
    Number(process.versions.node.split(".")[0]),
  );
  expect(runNpm).not.toHaveBeenCalled();
});

test("non-Linux full verifier uses the same local check registry", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  await import("../quality/docker-main.js");
  expect(runNpm).toHaveBeenCalledExactlyOnceWith(
    ["run", "verify:installed"],
    process.cwd(),
    7_200_000,
  );
  expect(runDockerVerifier).not.toHaveBeenCalled();
});
