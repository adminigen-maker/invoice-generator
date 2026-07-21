"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";

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
    <div className="w-full sm:w-64">
      <SearchableSelect
        value={current}
        onChange={pick}
        options={customers.map((c) => ({ value: c.id, label: c.label }))}
        placeholder="All customers"
      />
    </div>
  );
}
