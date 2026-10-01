/** Parse platform identities and rationale before review-policy decisions. */

export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("native metadata object required");
  }
  return value as Record<string, unknown>;
}

export function identifier(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error("positive platform identity required");
  }
  return value as number;
}

export function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("nonempty native metadata text required");
  }
  return value;
}

export function digest(value: unknown): string {
  const source = text(value);
  if (!/^[a-f0-9]{40}$/u.test(source)) {
    throw new Error("full Git commit identity required");
  }
  return source;
}

export function timestamp(value: unknown): number {
  const source = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(source)) {
    throw new Error("native UTC submission timestamp required");
  }
  const instant = Date.parse(source);
  if (
    !Number.isFinite(instant) ||
    new Date(instant).toISOString().replace(".000Z", "Z") !== source
  ) {
    throw new Error("native UTC submission timestamp is invalid");
  }
  return instant;
}

export function rationale(value: unknown): string {
  const source = text(value).trim();
  const prefix = "Policy rationale:";
  if (
    !source.startsWith(prefix) ||
    source.slice(prefix.length).trim().length < 30
  ) {
    throw new Error("approval needs explicit maintainer policy rationale");
  }
  return source;
}
