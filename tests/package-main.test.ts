import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { verifyPackageBuild } from "../quality/package-build.js";
import { readJson } from "../quality/security.js";
vi.mock("../quality/package-build.js", () => ({ verifyPackageBuild: vi.fn() }));
vi.mock("../quality/security.js", () => ({ readJson: vi.fn(() => 4321) }));
test("package entry uses this repository and its validated deadline", async () => {
  await import("../quality/package-main.js");
  expect(readJson).toHaveBeenCalledExactlyOnceWith(
    join(process.cwd(), "quality", "timeout.json"),
  );
  expect(verifyPackageBuild).toHaveBeenCalledExactlyOnceWith(
    process.cwd(),
    4321,
  );
});
