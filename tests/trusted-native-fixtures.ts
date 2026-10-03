/** Shared native-shaped evidence builders for independent policy probes. */

export function workflow(
  head: string,
  base: string,
  conclusion = "success",
): Record<string, unknown> {
  return {
    id: 1,
    workflow_id: 2,
    run_attempt: 3,
    head_sha: head,
    event: "pull_request",
    status: "completed",
    conclusion,
    pull_requests: [{ number: 1, head: { sha: head }, base: { sha: base } }],
  };
}

export function jobs(
  head: string,
  names: Set<string>,
): Record<string, unknown>[] {
  return [...names].sort().map((name, index) => ({
    id: index + 1,
    run_id: 1,
    run_attempt: 3,
    head_sha: head,
    name,
    status: "completed",
    conclusion: "success",
  }));
}

export function pull(head: string, base: string): Record<string, unknown> {
  return {
    number: 1,
    user: { id: 1 },
    head: { sha: head },
    base: { sha: base },
    state: "open",
    draft: false,
    commits: 1,
    merge_commit_sha: "c".repeat(40),
  };
}

export function nativeMap(
  values: Map<string, unknown>,
): (route: string) => Promise<unknown> {
  return (route) => {
    if (!values.has(route)) throw new Error(`unexpected native route ${route}`);
    return Promise.resolve(structuredClone(values.get(route)));
  };
}
