import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runNpm } from "../quality/commands.js";
import { verifySecurity } from "../quality/security.js";
import { verifySources, verifyTracked } from "../quality/source-scope.js";
import { prepareTests, verifyTests } from "../quality/test-report.js";
import { verify } from "../quality/pipeline.js";

vi.mock("../quality/commands.js", () => ({ runNpm: vi.fn() }));
vi.mock("../quality/security.js", async () => {
  const actual = await vi.importActual<typeof import("../quality/security.js")>(
    "../quality/security.js",
  );
  return { ...actual, verifySecurity: vi.fn() };
});
vi.mock("../quality/source-scope.js", () => ({
  verifySources: vi.fn(() => []),
  verifyTracked: vi.fn(),
}));
vi.mock("../quality/test-report.js", () => ({
  prepareTests: vi.fn(),
  verifyTests: vi.fn(),
}));
const roots: string[] = [];
function repository(checks: unknown, timeout: unknown = 5000): string {
  const root = mkdtempSync(join(tmpdir(), "relentless-pipeline-"));
  roots.push(root);
  mkdirSync(join(root, "quality"));
  writeFileSync(join(root, "quality", "checks.json"), JSON.stringify(checks));
  writeFileSync(join(root, "quality", "timeout.json"), JSON.stringify(timeout));
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

test.each([1, 5000])(
  "runs every check, security and full mutation with timeout %s",
  (timeout) => {
    const root = repository(
      [["first", "argument with spaces"], ["second"]],
      timeout,
    );
    const received: string[] = [];
    vi.mocked(runNpm).mockImplementation((args) => {
      received.push(args.join(" "));
    });
    vi.mocked(verifyTests).mockImplementation(() => {
      received.push("test integrity");
    });
    vi.mocked(verifySecurity).mockImplementation(() => {
      received.push("security");
    });
    verify(root);
    expect(received).toEqual([
      "first argument with spaces",
      "second",
      "test integrity",
      "security",
      "run mutation",
    ]);
    expect(prepareTests).toHaveBeenCalledExactlyOnceWith(root);
    expect(verifyTests).toHaveBeenCalledExactlyOnceWith(root, []);
    expect(verifySources).toHaveBeenCalledExactlyOnceWith(root);
    expect(verifyTracked).toHaveBeenCalledExactlyOnceWith(root);
    expect(verifySecurity).toHaveBeenCalledExactlyOnceWith(root, timeout);
    expect(runNpm).toHaveBeenNthCalledWith(
      1,
      ["first", "argument with spaces"],
      root,
      timeout,
    );
    expect(runNpm).toHaveBeenLastCalledWith(["run", "mutation"], root, timeout);
  },
);

test.each([null, {}, [], true, "text", [null], [[]], [[""]], [[1]]])(
  "rejects malformed check registry %j",
  (checks) => {
    expect(() => {
      verify(repository(checks));
    }).toThrow();
    expect(runNpm).not.toHaveBeenCalled();
    expect(verifySecurity).not.toHaveBeenCalled();
  },
);

test.each([null, true, "5", 0, -1, 0.5])(
  "rejects malformed deadline %j",
  (timeout) => {
    expect(() => {
      verify(repository([["first"]], timeout));
    }).toThrow();
    expect(runNpm).not.toHaveBeenCalled();
  },
);

test("a failed command prevents later checks, security and mutation", () => {
  const root = repository([["first"], ["second"]]);
  vi.mocked(runNpm).mockImplementationOnce(() => {
    throw new Error("tool failed");
  });
  expect(() => {
    verify(root);
  }).toThrow("tool failed");
  expect(runNpm).toHaveBeenCalledTimes(1);
  expect(verifySecurity).not.toHaveBeenCalled();
});

test("missing registry cannot disappear silently", () => {
  const root = repository([["first"]]);
  rmSync(join(root, "quality", "checks.json"));
  expect(() => {
    verify(root);
  }).toThrow();
  expect(runNpm).not.toHaveBeenCalled();
});

test("failed test receipt stops security and mutation", () => {
  vi.mocked(verifyTests).mockImplementationOnce(() => {
    throw new Error("incomplete tests");
  });
  const root = repository([["first"]]);
  expect(() => {
    verify(root);
  }).toThrow("incomplete tests");
  expect(verifySecurity).not.toHaveBeenCalled();
  expect(runNpm).toHaveBeenCalledExactlyOnceWith(["first"], root, 5000);
});
