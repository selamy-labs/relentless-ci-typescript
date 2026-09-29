import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { verifyJson } from "./support-formats.js";

const release = z.strictObject({
  major: z.string().regex(/^[1-9]\d*$/u),
  start: z.iso.date(),
  end: z.iso.date(),
});
const policy = z.strictObject({
  source: z
    .string()
    .regex(
      /^https:\/\/raw\.githubusercontent\.com\/nodejs\/Release\/[a-f0-9]{40}\/schedule\.json$/u,
    ),
  reviewedOn: z.iso.date(),
  reviewBy: z.iso.date(),
  releases: z.array(release).min(1),
});
const matrix = z.object({
  strategy: z.object({
    matrix: z.object({ node: z.array(z.string()).min(1) }),
  }),
});

function text(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

function json(path: string): unknown {
  const source = text(path);
  verifyJson(source);
  return JSON.parse(source);
}

function workflow(path: string): unknown {
  const document = parseDocument(text(path), { stringKeys: true });
  z.array(z.never()).parse([...document.errors, ...document.warnings]);
  return document.toJS({ maxAliasCount: 0 });
}

export function verifyRuntimes(root: string, today: string): void {
  z.iso.date().parse(today);
  const approved = policy.parse(
    json(join(root, "quality/runtime-support.json")),
  );
  if (today < approved.reviewedOn || today >= approved.reviewBy) {
    throw new Error(
      "runtime support schedule requires a current upstream review",
    );
  }
  const versions = new Set<string>();
  for (const item of approved.releases) {
    requireRelease(item, today, versions);
  }
  const expected = [...versions];
  verifyEngines(root, expected);
  verifyMatrices(root, expected);
}

function requireRelease(
  item: z.infer<typeof release>,
  today: string,
  versions: Set<string>,
): void {
  if (versions.has(item.major)) {
    throw new Error("runtime support policy contains a duplicate release line");
  }
  if (today < item.start || today >= item.end) {
    throw new Error(`Node ${item.major} is outside its upstream support dates`);
  }
  versions.add(item.major);
}

function verifyEngines(root: string, expected: string[]): void {
  const declared = z
    .object({ engines: z.object({ node: z.string() }) })
    .parse(json(join(root, "package.json")));
  if (
    declared.engines.node !==
    expected.map((major) => `^${major}.0.0`).join(" || ")
  ) {
    throw new Error(
      "declared Node engines differ from the reviewed support policy",
    );
  }
}

function verifyMatrices(root: string, expected: string[]): void {
  const jobs = z
    .object({ jobs: z.object({ analysis: matrix, compatibility: matrix }) })
    .parse(workflow(join(root, ".github/workflows/ci.yml"))).jobs;
  for (const job of [jobs.analysis, jobs.compatibility]) {
    if (JSON.stringify(job.strategy.matrix.node) !== JSON.stringify(expected)) {
      throw new Error(
        "required Node runtime matrix differs from reviewed support policy",
      );
    }
  }
}
