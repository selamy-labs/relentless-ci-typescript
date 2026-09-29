import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { npmOutput } from "./npm-output.js";
import { verifyConsumerMetadata } from "./consumer-metadata.js";
import { consumerNode } from "./consumer-command.js";

const sample = "[[3,5],[0,2],[2,4],[8,10]]";
const canonical = "[[0,5],[8,10]]\n";
const api =
  "const {normalize}=await import(process.argv[1]);process.stdout.write(JSON.stringify(normalize(JSON.parse(process.argv[2])))+'\\n');";

function behavior(consumer: string, name: string, timeout: number): void {
  consumerNode(
    ["--input-type=module", "-e", api, name, sample],
    consumer,
    timeout,
    "",
    { status: 0, stdout: canonical, stderr: "" },
  );
  const cli = [
    z.string().min(1).parse(process.env.npm_execpath),
    "exec",
    "--offline",
    "--no",
    "--loglevel=error",
    "--",
    "relentless-example",
  ];
  consumerNode(cli, consumer, timeout, sample, {
    status: 0,
    stdout: canonical,
    stderr: "",
  });
  consumerNode(cli, consumer, timeout, "not JSON", {
    status: 2,
    stdout: "",
    stderr: "error: invalid JSON\n",
  });
  consumerNode(cli, consumer, timeout, "[[0,1000001]]", {
    status: 2,
    stdout: "",
    stderr: "error: endpoints must be between -1000000 and 1000000\n",
  });
}

function types(
  root: string,
  consumer: string,
  name: string,
  timeout: number,
): void {
  writeFileSync(
    join(consumer, "consumer.mts"),
    `import {normalize} from ${JSON.stringify(name)};\nconst result: readonly (readonly [number,number])[] = normalize([[0,1]]);\nvoid result;\n`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        types: [],
      },
      include: ["consumer.mts"],
    }),
  );
  consumerNode(
    [
      join(root, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      join(consumer, "tsconfig.json"),
    ],
    consumer,
    timeout,
    "",
    { status: 0, stdout: "", stderr: "" },
  );
}

export function verifyPackageConsumer(
  root: string,
  archive: string,
  name: string,
  timeout: number,
): void {
  const consumer = mkdtempSync(join(tmpdir(), "relentless-installed-package-"));
  try {
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({
        name: "isolated-consumer",
        version: "1.0.0",
        private: true,
        type: "module",
      }),
    );
    npmOutput(
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        archive,
      ],
      consumer,
      timeout,
    );
    verifyConsumerMetadata(consumer, name);
    behavior(consumer, z.string().min(1).parse(name), timeout);
    types(root, consumer, name, timeout);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}
