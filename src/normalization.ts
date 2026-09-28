import { intervals, type Interval } from "./validation.js";

function appendInterval(result: Interval[], [start, end]: Interval): void {
  const last = result.at(-1);
  if (last !== undefined && start <= last[1]) {
    last[1] = Math.max(last[1], end);
    return;
  }
  result.push([start, end]);
}

/** Return the canonical union without changing the caller's input. */
export function normalize(value: unknown): Interval[] {
  const result: Interval[] = [];
  for (const item of intervals(value).sort((a, b) => a[0] - b[0])) {
    appendInterval(result, item);
  }
  return result;
}
