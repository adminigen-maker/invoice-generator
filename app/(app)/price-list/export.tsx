"use client";

import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PriceRow = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  factor: number;
  sale: number;
  cost?: number | null;
};

export function PriceListExport({ rows, withCost }: { rows: PriceRow[]; withCost: boolean }) {
  function exportCsv() {
    if (!rows.length) return;
    // Quote + neutralize spreadsheet formula injection (leading = + - @ / control).
    const esc = (v: unknown) => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["SKU", "Product", "Category", "Unit", "Qty in base", "Sale price", ...(withCost ? ["Cost price"] : [])];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [r.sku, r.name, r.category, r.unit, r.factor, r.sale, ...(withCost ? [r.cost ?? 0] : [])].map(esc).join(",")
      );
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "price-list.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length > 1 ? "s" : ""}`);
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4 mr-2" />Print
      </Button>
      <Button variant="outline" size="sm" onClick={exportCsv}>
        <Download className="h-4 w-4 mr-2" />Export CSV
      </Button>
    </div>
  );
}
