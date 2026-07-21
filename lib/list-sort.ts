export type SortSpec = { column: string; ascending: boolean };

/**
 * Resolve ?sort / ?dir against a per-page allowlist (so a crafted URL can't
 * order by an arbitrary column). Falls back to newest-first, which is the
 * default for every list: the most recently created record sits on top.
 */
export function resolveSort(
  sort: string | undefined,
  dir: string | undefined,
  allowed: readonly string[],
  fallback = "created_at"
): SortSpec {
  const column = sort && allowed.includes(sort) ? sort : fallback;
  return { column, ascending: dir === "asc" };
}
