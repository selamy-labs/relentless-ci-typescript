/** Fixed GitHub CLI transport for a dedicated installation-token check. */

import { execFileSync } from "node:child_process";
import type { CheckPayload, CheckTransport } from "./check-publisher.js";
import {
  decodeResponse,
  endpointPath,
  githubApi,
  repositoryRoute,
} from "./github-read.js";

const VERSION = "X-GitHub-Api-Version: 2026-03-10";
const MAX_BYTES = 8 * 1024 * 1024;

export type Execute = typeof execFileSync;

export function checkTransport(
  executable: string,
  repository: string,
  execute: Execute = execFileSync,
): CheckTransport {
  const root = repositoryRoute(repository);
  const read = githubApi(executable, repository, execute);
  return {
    get: (route) => Promise.resolve(read(route)),
    post: (route, body: CheckPayload) => {
      if (route !== `${root}/check-runs`) {
        throw new Error(
          "App check creation route differs from trusted repository",
        );
      }
      const path = endpointPath(route, repository);
      const bytes = execute(
        executable,
        [
          "api",
          "--hostname",
          "github.com",
          "--method",
          "POST",
          "-H",
          VERSION,
          "--input",
          "-",
          path,
        ],
        {
          input: JSON.stringify(body),
          timeout: 30_000,
          maxBuffer: MAX_BYTES + 1,
        },
      );
      return Promise.resolve().then(() => decodeResponse(bytes));
    },
  };
}
