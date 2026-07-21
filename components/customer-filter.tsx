"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Opt = { id: string; label: string };

/** Customer picker that drives ?customer= on the dashboard. */
export function CustomerFilter({ customers }: { customers: Opt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("customer") ?? "";

  function pick(id: string) {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("customer", id);
    else sp.delete("customer");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => pick(e.target.value)}
      aria-label="Filter by customer"
      className="h-9 w-full sm:w-64 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">All customers</option>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}
