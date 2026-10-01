/** Publish a fixed, App-owned policy check and verify its native readback. */

import { z } from "zod";

export const CHECK_NAME = "Relentless trusted policy";

const sha = z.string().regex(/^[0-9a-f]{40}$/u);
const positiveId = z.number().int().positive();
const checkResponse = z.object({
  id: positiveId,
  name: z.string(),
  head_sha: z.string(),
  status: z.string(),
  conclusion: z.string(),
  app: z.object({ id: positiveId }),
});

export interface CheckPayload {
  name: typeof CHECK_NAME;
  head_sha: string;
  status: "completed";
  conclusion: "success" | "failure";
  output: { title: string; summary: string };
}

export interface CheckTransport {
  post: (route: string, body: CheckPayload) => Promise<unknown>;
  get: (route: string) => Promise<unknown>;
}

export function checkPayload(head: unknown, passed: unknown): CheckPayload {
  const digest = sha.parse(head);
  const decision = z.boolean().parse(passed);
  return {
    name: CHECK_NAME,
    head_sha: digest,
    status: "completed",
    conclusion: decision ? "success" : "failure",
    output: {
      title: decision ? "Trusted policy qualified" : "Trusted policy rejected",
      summary: decision
        ? "Native run, review, and protected policy evidence qualified."
        : "Required trusted policy evidence is absent or invalid.",
    },
  };
}

export function verifyCheckResponse(
  value: unknown,
  expected: CheckPayload,
  appId: unknown,
): number {
  const check = checkResponse.parse(value);
  const owner = positiveId.parse(appId);
  if (
    check.name !== expected.name ||
    check.head_sha !== expected.head_sha ||
    check.status !== expected.status ||
    check.conclusion !== expected.conclusion ||
    check.app.id !== owner
  ) {
    throw new Error("native check differs from the dedicated App decision");
  }
  return check.id;
}

function repositoryRoute(repository: unknown): string {
  const value = z.string().parse(repository);
  const parts = value.split("/");
  if (
    parts.length !== 2 ||
    parts.some(
      (part) =>
        !/^[A-Za-z0-9_.-]+$/u.test(part) || part === "." || part === "..",
    )
  ) {
    throw new Error("repository identity is invalid");
  }
  return `repos/${value}/check-runs`;
}

export async function publishCheck(
  transport: CheckTransport,
  repository: unknown,
  appId: unknown,
  head: unknown,
  passed: unknown,
): Promise<number> {
  const route = repositoryRoute(repository);
  const body = checkPayload(head, passed);
  positiveId.parse(appId);
  const created = await transport.post(route, body);
  const id = verifyCheckResponse(created, body, appId);
  const observed = await transport.get(`${route}/${String(id)}`);
  if (verifyCheckResponse(observed, body, appId) !== id) {
    throw new Error("native check readback changed identity");
  }
  return id;
}
