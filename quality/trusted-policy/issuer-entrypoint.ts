/** Protected-base entrypoint for the TypeScript template's policy issuer. */

import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { publishCheck } from "./check-publisher.js";
import { checkTransport, type Execute } from "./check-transport.js";
import { decodeResponse, githubApi, repositoryRoute } from "./github-read.js";
import type { ReviewedPolicy } from "./issuer-resolution.js";
import type { ReadApi } from "./metadata-pages.js";
import { digest, identifier, record, text } from "./review-fields.js";
import { issue } from "./trusted-issuer.js";

const WORKFLOW_PATH = ".github/workflows/ci.yml";
const WORKFLOW_NAME = "Relentless CI";
const VERSIONS = ["22", "24", "26"] as const;
const SYSTEMS = ["ubuntu-24.04", "macos-15", "windows-2025"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

export function requiredNames(): Set<string> {
  const names = new Set<string>(["Relentless CI gate"]);
  for (const version of VERSIONS) {
    names.add(`Full analysis (Node ${version})`);
    for (const system of SYSTEMS) {
      names.add(`Installed behavior (${system}, Node ${version})`);
    }
  }
  return names;
}

function currentBase(
  repository: unknown,
  branch: unknown,
  expected: string,
  base: string,
): number {
  const native = record(repository);
  const main = record(branch);
  if (native.full_name !== expected || native.default_branch !== "main") {
    throw new Error("issuer repository identity or default branch changed");
  }
  if (
    main.name !== "main" ||
    main.protected !== true ||
    digest(record(main.commit).sha) !== digest(base)
  ) {
    throw new Error("issuer did not run from current protected main");
  }
  return identifier(native.id);
}

function currentWorkflow(value: unknown): number {
  const workflow = record(value);
  if (
    workflow.name !== WORKFLOW_NAME ||
    workflow.path !== WORKFLOW_PATH ||
    workflow.state !== "active"
  ) {
    throw new Error("required CI workflow identity differs");
  }
  return identifier(workflow.id);
}

export async function reviewedPolicy(
  api: ReadApi,
  repository: string,
  base: string,
): Promise<ReviewedPolicy> {
  const root = repositoryRoute(repository);
  const identity = currentBase(
    await api(root),
    await api(`${root}/branches/main`),
    repository,
    base,
  );
  const workflow = currentWorkflow(
    await api(`${root}/actions/workflows/ci.yml`),
  );
  return {
    repository,
    repositoryId: identity,
    base,
    workflowId: workflow,
    requiredNames: requiredNames(),
  };
}

export function eventPayload(path: string): unknown {
  if (!isAbsolute(path)) {
    throw new Error("trusted event file must be absolute");
  }
  const info = statSync(path);
  if (!info.isFile() || info.size > MAX_BYTES) {
    throw new Error("trusted event file is missing or too large");
  }
  return decodeResponse(readFileSync(path));
}

export function appId(value: unknown): number {
  const source = text(value);
  if (!/^[1-9][0-9]*$/u.test(source)) {
    throw new Error("dedicated App ID is not a positive decimal identity");
  }
  return identifier(Number(source));
}

export async function main(
  env: NodeJS.ProcessEnv,
  executable: string,
  execute?: Execute,
): Promise<number> {
  const repository = text(env.GITHUB_REPOSITORY);
  const base = digest(env.GITHUB_SHA);
  const eventName = text(env.GITHUB_EVENT_NAME);
  const event = eventPayload(text(env.GITHUB_EVENT_PATH));
  const app = appId(env.RELENTLESS_POLICY_APP_ID);
  if (!env.GH_TOKEN) {
    throw new Error("dedicated App installation token is missing");
  }
  const read = githubApi(executable, repository, execute);
  const api: ReadApi = (route) => Promise.resolve(read(route));
  const reviewed = await reviewedPolicy(api, repository, base);
  const transport = checkTransport(executable, repository, execute);
  return issue(
    api,
    (head, passed) => publishCheck(transport, repository, app, head, passed),
    eventName,
    event,
    reviewed,
  );
}
