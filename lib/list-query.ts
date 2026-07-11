/**
 * Helpers for list-page filtering (search + active/inactive views).
 *
 * Search boxes feed a free-text `q` into PostgREST `.or(...)` filters. The
 * value is interpolated into a filter string, so it must be sanitized:
 *  - commas and parentheses would break the OR grouping syntax
 *  - `*` / `%` are wildcard characters
 *  - backslash / quotes can escape or terminate the value
 * We strip those, then wrap the term in `*…*` (PostgREST's ilike wildcard) so
 * the search is a case-insensitive "contains".
 */
export function ilikeTerm(q: string | undefined | null): string | null {
  if (!q) return null;
  const safe = q.replace(/[%*,()"\\]/g, "").trim();
  if (!safe) return null;
  return `*${safe}*`;
}
