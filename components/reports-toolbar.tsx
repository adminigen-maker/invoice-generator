"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Opt = { id: string; label: string };

/** Date-range + customer filter (drives ?from / ?to / ?customer) plus a client-side CSV export. */
export function ReportsToolbar({
  csv,
  filename,
  customers = [],
}: {
  csv: string;
  filename: string;
  customers?: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [customer, setCustomer] = useState(params.get("customer") ?? "");

  function apply() {
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (customer) sp.set("customer", customer);
    router.push(`${pathname}?${sp.toString()}`);
  }
  function clear() {
    setFrom("");
    setTo("");
    setCustomer("");
    router.push(pathname);
  }
  function download() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = !!(from || to || customer);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">From</label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">To</label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
      </div>
      {customers.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Customer</label>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      )}
      <Button size="sm" onClick={apply}><Filter className="h-4 w-4 mr-1" />Apply</Button>
      {filtered && (
        <Button size="sm" variant="outline" onClick={clear}><X className="h-4 w-4 mr-1" />Clear</Button>
      )}
      <Button size="sm" variant="outline" onClick={download} className="ml-auto">
        <Download className="h-4 w-4 mr-1" />Export CSV
      </Button>
    </div>
  );
}
