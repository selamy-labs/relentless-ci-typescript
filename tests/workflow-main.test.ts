import { expect, test, vi } from "vitest";
import { verifyWorkflows } from "../quality/workflows.js";

vi.mock("../quality/workflows.js", () => ({ verifyWorkflows: vi.fn() }));

test("workflow entry point verifies the current checkout", async () => {
  await import("../quality/workflow-main.js");
  expect(verifyWorkflows).toHaveBeenCalledExactlyOnceWith(process.cwd());
});
