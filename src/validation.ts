/** Validate the public boundary without trusting caller types. */
export type Interval = [number, number];
const limit = 1_000_000;

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function endpoint(value: unknown): number {
  if (!isInteger(value)) {
    throw new Error("endpoints must be integers");
  }
  if (value < -limit || value > limit) {
    throw new Error("endpoints must be between -1000000 and 1000000");
  }
  return value;
}

function interval(value: unknown): Interval {
  if (!isArray(value) || value.length !== 2) {
    throw new Error("each interval must contain exactly two endpoints");
  }
  const start = endpoint(value[0]);
  const end = endpoint(value[1]);
  if (start >= end) {
    throw new Error("interval start must be less than end");
  }
  return [start, end];
}

export function intervals(value: unknown): Interval[] {
  if (!isArray(value)) {
    throw new Error("input must be an array of intervals");
  }
  return value.map(interval);
}
