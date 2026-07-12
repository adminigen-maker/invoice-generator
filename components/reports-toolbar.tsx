"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Date-range filter (drives ?from / ?to) + a client-side CSV export of the report. */
export function ReportsToolbar({ csv, filename }: { csv: string; filename: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  function apply() {
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    router.push(`${pathname}?${sp.toString()}`);
  }
  function clear() {
    setFrom("");
    setTo("");
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
      <Button size="sm" onClick={apply}><Filter className="h-4 w-4 mr-1" />Apply</Button>
      {(from || to) && (
        <Button size="sm" variant="outline" onClick={clear}><X className="h-4 w-4 mr-1" />Clear</Button>
      )}
      <Button size="sm" variant="outline" onClick={download} className="ml-auto">
        <Download className="h-4 w-4 mr-1" />Export CSV
      </Button>
    </div>
  );
}
