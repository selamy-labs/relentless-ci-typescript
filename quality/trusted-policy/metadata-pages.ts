/** Collect complete bounded native GitHub inventories. */

export const PAGE_SIZE = 100;
export const MAX_PAGES = 1000;

export type ReadApi = (route: string) => Promise<unknown>;

function pageItems(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > PAGE_SIZE) {
    throw new Error("native page must contain at most 100 items");
  }
  return value as unknown[];
}

export function pageRoute(endpoint: string, page: number): string {
  if (endpoint.includes("?") || endpoint.includes("#")) {
    throw new Error("native inventory endpoint contains a query or fragment");
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGES) {
    throw new Error("native inventory page is outside the collection budget");
  }
  return `${endpoint}?per_page=100&page=${String(page)}`;
}

export async function arrayInventory(
  api: ReadApi,
  endpoint: string,
): Promise<unknown[]> {
  const result: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const current = pageItems(await api(pageRoute(endpoint, page)));
    if (current.length === 0) return result;
    result.push(...current);
  }
  throw new Error("native inventory exceeded the collection budget");
}

function objectPage(value: unknown, key: string): [number, unknown[]] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("native object inventory response required");
  }
  const data = value as Record<string, unknown>;
  const total = data.total_count;
  if (!Number.isSafeInteger(total) || (total as number) < 0) {
    throw new Error("native inventory count is invalid");
  }
  return [total as number, pageItems(data[key])];
}

function stableCount(previous: number | undefined, current: number): number {
  if (previous !== undefined && previous !== current) {
    throw new Error("native inventory changed during pagination");
  }
  return current;
}

function completeObjectInventory(
  total: number,
  result: unknown[],
): [number, unknown[]] {
  if (result.length !== total) {
    throw new Error("native count differs from complete inventory");
  }
  return [total, result];
}

export async function objectInventory(
  api: ReadApi,
  endpoint: string,
  key: string,
): Promise<[number, unknown[]]> {
  const result: unknown[] = [];
  let total: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const [count, current] = objectPage(
      await api(pageRoute(endpoint, page)),
      key,
    );
    total = stableCount(total, count);
    if (current.length === 0) {
      return completeObjectInventory(total, result);
    }
    result.push(...current);
  }
  throw new Error("native inventory exceeded the collection budget");
}
