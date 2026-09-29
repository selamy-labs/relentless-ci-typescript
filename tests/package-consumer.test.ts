import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { verifyConsumerMetadata } from "../quality/consumer-metadata.js";
import { consumerNode } from "../quality/consumer-command.js";
import { npmOutput } from "../quality/npm-output.js";
import { verifyPackageConsumer } from "../quality/package-consumer.js";

vi.mock("../quality/consumer-metadata.js", () => ({
  verifyConsumerMetadata: vi.fn(),
}));
vi.mock("../quality/consumer-command.js", () => ({ consumerNode: vi.fn() }));
vi.mock("../quality/npm-output.js", () => ({
  npmOutput: vi.fn(() => Buffer.from("installed")),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

test("installs only the archive offline and checks public API, CLI and shipped types in an isolated consumer", () => {
  vi.stubEnv("npm_execpath", "/native/npm-cli.js");
  let consumer = "";
  vi.mocked(npmOutput).mockImplementationOnce((_args, cwd) => {
    consumer = cwd;
    expect(realpathSync(join(cwd, ".."))).toBe(realpathSync(tmpdir()));
    expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))).toEqual(
      {
        name: "isolated-consumer",
        version: "1.0.0",
        private: true,
        type: "module",
      },
    );
    return Buffer.from("installed");
  });
  let types = "";
  let config: unknown;
  vi.mocked(consumerNode).mockImplementation((args, cwd) => {
    if (args.includes("--project")) {
      types = readFileSync(join(cwd, "consumer.mts"), "utf8");
      config = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8"));
    }
  });
  verifyPackageConsumer("/repository", "/artifact.tgz", "sample", 1234);
  expect(npmOutput).toHaveBeenCalledExactlyOnceWith(
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "/artifact.tgz",
    ],
    consumer,
    1234,
  );
  expect(consumerNode).toHaveBeenCalledTimes(5);
  expect(consumerNode).toHaveBeenNthCalledWith(
    1,
    [
      "--input-type=module",
      "-e",
      expect.stringContaining("await import(process.argv[1])"),
      "sample",
      "[[3,5],[0,2],[2,4],[8,10]]",
    ],
    consumer,
    1234,
    "",
    { status: 0, stdout: "[[0,5],[8,10]]\n", stderr: "" },
  );
  expect(verifyConsumerMetadata).toHaveBeenCalledExactlyOnceWith(
    consumer,
    "sample",
  );
  const cli = [
    "/native/npm-cli.js",
    "exec",
    "--offline",
    "--no",
    "--",
    "relentless-example",
  ];
  expect(consumerNode).toHaveBeenNthCalledWith(
    2,
    cli,
    consumer,
    1234,
    "[[3,5],[0,2],[2,4],[8,10]]",
    { status: 0, stdout: "[[0,5],[8,10]]\n", stderr: "" },
  );
  expect(consumerNode).toHaveBeenNthCalledWith(
    3,
    cli,
    consumer,
    1234,
    "not JSON",
    { status: 2, stdout: "", stderr: "error: invalid JSON\n" },
  );
  expect(consumerNode).toHaveBeenNthCalledWith(
    4,
    cli,
    consumer,
    1234,
    "[[0,1000001]]",
    {
      status: 2,
      stdout: "",
      stderr: "error: endpoints must be between -1000000 and 1000000\n",
    },
  );
  expect(consumerNode).toHaveBeenLastCalledWith(
    [
      join("/repository", "node_modules", "typescript", "bin", "tsc"),
      "--project",
      join(consumer, "tsconfig.json"),
    ],
    consumer,
    1234,
    "",
    { status: 0, stdout: "", stderr: "" },
  );
  expect(types).toBe(
    'import {normalize} from "sample";\nconst result: readonly (readonly [number,number])[] = normalize([[0,1]]);\nvoid result;\n',
  );
  expect(config).toEqual({
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      types: [],
    },
    include: ["consumer.mts"],
  });
  expect(existsSync(consumer)).toBe(false);
});

test("failed installation stops execution and cleans the owned consumer", () => {
  let consumer = "";
  vi.mocked(npmOutput).mockImplementationOnce((_args, cwd) => {
    consumer = cwd;
    throw new Error("install failed");
  });
  expect(() => {
    verifyPackageConsumer("/repository", "/artifact.tgz", "sample", 1);
  }).toThrow("install failed");
  expect(consumerNode).not.toHaveBeenCalled();
  expect(existsSync(consumer)).toBe(false);
});

test("removed consumer during native failure preserves the original error", () => {
  vi.mocked(npmOutput).mockImplementationOnce((_args, cwd) => {
    rmSync(cwd, { recursive: true });
    throw new Error("install failed");
  });
  expect(() => {
    verifyPackageConsumer("/repository", "/artifact.tgz", "sample", 1);
  }).toThrow("install failed");
});

test("failed behavior stops later probes and still cleans the consumer", () => {
  vi.mocked(consumerNode).mockImplementationOnce(() => {
    throw new Error("bad installed behavior");
  });
  expect(() => {
    verifyPackageConsumer("/repository", "/artifact.tgz", "sample", 1);
  }).toThrow("bad installed behavior");
  expect(consumerNode).toHaveBeenCalledTimes(1);
  const cwd = z.string().parse(vi.mocked(npmOutput).mock.calls.at(0)?.[1]);
  expect(existsSync(cwd)).toBe(false);
});
