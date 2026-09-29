import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runNpm } from "../quality/commands.js";
import { npmOutput } from "../quality/npm-output.js";
import { verifyPackage } from "../quality/package-report.js";
import { verifyPackageConsumer } from "../quality/package-consumer.js";
import { verifyPackageBuild } from "../quality/package-build.js";
import policy from "../quality/package-policy.json" with { type: "json" };

vi.mock("../quality/package-consumer.js", () => ({
  verifyPackageConsumer: vi.fn(),
}));
vi.mock("../quality/commands.js", () => ({ runNpm: vi.fn() }));
vi.mock("../quality/npm-output.js", () => ({ npmOutput: vi.fn() }));
vi.mock("../quality/package-report.js", async () => {
  const actual = await vi.importActual<
    typeof import("../quality/package-report.js")
  >("../quality/package-report.js");
  return { ...actual, verifyPackage: vi.fn() };
});
const roots: string[] = [];
const bytes = Buffer.from("fresh archive");
function setup(): { root: string; stage: () => string } {
  const root = mkdtempSync(join(tmpdir(), "relentless-package-build-test-"));
  roots.push(root);
  for (const name of ["package.json", "README.md", "LICENSE"])
    writeFileSync(join(root, name), name);
  let stage = "";
  vi.mocked(runNpm).mockImplementation((args) => {
    stage = join(z.string().parse(args.at(-1)), "..");
    mkdirSync(join(stage, "dist"));
    for (const name of policy.files.filter((name) => name.startsWith("dist/")))
      writeFileSync(join(stage, name), name);
  });
  vi.mocked(npmOutput).mockImplementation((_args, cwd) => {
    writeFileSync(join(cwd, "sample.tgz"), bytes);
    return Buffer.from(
      JSON.stringify([
        {
          name: "sample",
          version: "0.1.0",
          filename: "sample.tgz",
          size: 13,
          unpackedSize: 13,
          entryCount: 1,
          files: [{ path: "index.js", size: 13, mode: 420 }],
          shasum: "hash",
          integrity: "integrity",
        },
      ]),
    );
  });
  return { root, stage: () => stage };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

test("builds into a fresh public stage, validates before saving receipts and cleans up", () => {
  const { root, stage } = setup();
  mkdirSync(join(root, ".quality-results"));
  verifyPackageBuild(root, 1234);
  expect(realpathSync(join(stage(), ".."))).toBe(realpathSync(tmpdir()));
  expect(runNpm).toHaveBeenCalledExactlyOnceWith(
    ["run", "build", "--", "--outDir", join(stage(), "dist")],
    root,
    1234,
  );
  expect(npmOutput).toHaveBeenCalledExactlyOnceWith(
    ["pack", "--ignore-scripts", "--json"],
    stage(),
    1234,
  );
  const expected = new Map(
    policy.files.map((name) => [name, Buffer.from(name)]),
  );
  expect(verifyPackage).toHaveBeenCalledExactlyOnceWith(
    expect.any(Array),
    bytes,
    expected,
  );
  expect(readFileSync(join(root, ".quality-results/package.tgz"))).toEqual(
    bytes,
  );
  expect(
    JSON.parse(
      readFileSync(join(root, ".quality-results/package.json"), "utf8"),
    ),
  ).toEqual(expect.any(Array));
  expect(existsSync(stage())).toBe(false);
  expect(existsSync(join(root, "dist"))).toBe(false);
});

test.each([
  Buffer.from("not JSON"),
  Buffer.from([255]),
  Buffer.from('[{"filename":"../escape.tgz"}]'),
])(
  "malformed native receipt fails and its owned stage is removed",
  (receipt) => {
    const { root, stage } = setup();
    vi.mocked(npmOutput).mockReturnValueOnce(receipt);
    expect(() => {
      verifyPackageBuild(root, 1234);
    }).toThrow();
    expect(verifyPackage).not.toHaveBeenCalled();
    expect(existsSync(stage())).toBe(false);
    expect(existsSync(join(root, ".quality-results/package.json"))).toBe(false);
  },
);

test("content validation failure does not save a successful receipt", () => {
  const { root, stage } = setup();
  vi.mocked(verifyPackage).mockImplementationOnce(() => {
    throw new Error("bad content");
  });
  expect(() => {
    verifyPackageBuild(root, 1234);
  }).toThrow("bad content");
  expect(existsSync(stage())).toBe(false);
  expect(existsSync(join(root, ".quality-results/package.tgz"))).toBe(false);
});

test("a failed build prevents packing and removes its stage", () => {
  const { root, stage } = setup();
  vi.mocked(runNpm).mockImplementationOnce((args) => {
    const path = z.string().parse(args.at(-1));
    throw new Error(path);
  });
  expect(() => {
    verifyPackageBuild(root, 1);
  }).toThrow();
  const call = vi.mocked(runNpm).mock.calls.at(0);
  const args = z.array(z.string()).parse(call?.[0]);
  expect(existsSync(join(z.string().parse(args.at(-1)), ".."))).toBe(false);
  expect(npmOutput).not.toHaveBeenCalled();
  expect(stage()).toBe("");
});

test("a native compiler can remove its stage before failing without masking the original failure", () => {
  const { root } = setup();
  vi.mocked(runNpm).mockImplementationOnce((args) => {
    const stage = join(z.string().parse(args.at(-1)), "..");
    rmSync(stage, { recursive: true });
    throw new Error("native compiler failed");
  });
  expect(() => {
    verifyPackageBuild(root, 1);
  }).toThrow("native compiler failed");
});

test("UTF-8 corruption inside a valid receipt string is rejected before content validation", () => {
  const { root, stage } = setup();
  const implementation = vi.mocked(npmOutput).getMockImplementation();
  vi.mocked(npmOutput).mockImplementationOnce((args, cwd, timeout) => {
    const bytes = z
      .instanceof(Buffer)
      .parse(implementation?.(args, cwd, timeout));
    const index = bytes.indexOf("sample");
    bytes[index] = 255;
    return bytes;
  });
  expect(() => {
    verifyPackageBuild(root, 1234);
  }).toThrow();
  expect(verifyPackage).not.toHaveBeenCalled();
  expect(existsSync(stage())).toBe(false);
});

test("consumer validation must finish before saving package receipts", () => {
  const { root, stage } = setup();
  vi.mocked(verifyPackageConsumer).mockImplementationOnce(() => {
    throw new Error("broken installed types");
  });
  expect(() => {
    verifyPackageBuild(root, 1234);
  }).toThrow("broken installed types");
  expect(existsSync(stage())).toBe(false);
  expect(existsSync(join(root, ".quality-results/package.tgz"))).toBe(false);
});
