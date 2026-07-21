"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type FilterOption = { value: string; label: string };

/**
 * A labelled dropdown filter that drives a single URL query param, so the
 * server component re-renders with the filter applied (and the choice survives
 * a refresh or a shared link).
 */
export function SelectFilter({
  param,
  label,
  options,
  allLabel = "All",
  className = "w-44",
}: {
  param: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(param) ?? "";

  function pick(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(param, value);
    else sp.delete(param);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select
        value={current}
        onChange={(e) => pick(e.target.value)}
        className={`h-9 rounded-md border border-input bg-background px-2 text-sm ${className}`}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
