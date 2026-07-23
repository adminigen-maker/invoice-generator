"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead } from "@/components/ui/table";
import { bulkDelete } from "@/lib/bulk/bulk-delete";

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleMany: (ids: string[], checked: boolean) => void;
  clear: () => void;
};

const SelCtx = createContext<Ctx | null>(null);

function useSel(): Ctx {
  const c = useContext(SelCtx);
  if (!c) throw new Error("bulk-select components must be inside <SelectionProvider>");
  return c;
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const toggleMany = useCallback((ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      for (const id of ids) {
        if (checked) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const value = useMemo(() => ({ selected, toggle, toggleMany, clear }), [selected, toggle, toggleMany, clear]);
  return <SelCtx.Provider value={value}>{children}</SelCtx.Provider>;
}

const boxClass = "h-4 w-4 rounded border-input accent-primary align-middle cursor-pointer";

/** First cell of a data row — the per-row checkbox. */
export function RowCheck({ id }: { id: string }) {
  const { selected, toggle } = useSel();
  return (
    <TableCell className="w-8">
      <input
        type="checkbox"
        checked={selected.has(id)}
        onChange={() => toggle(id)}
        className={boxClass}
        aria-label="Select row"
      />
    </TableCell>
  );
}

/** First header cell — the select-all checkbox (indeterminate when partial). */
export function SelectAllHead({ ids }: { ids: string[] }) {
  const { selected, toggleMany } = useSel();
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = ids.some((id) => selected.has(id));
  return (
    <TableHead className="w-8">
      <input
        type="checkbox"
        checked={allChecked}
        ref={(el) => {
          if (el) el.indeterminate = !allChecked && someChecked;
        }}
        onChange={(e) => toggleMany(ids, e.target.checked)}
        className={boxClass}
        aria-label="Select all"
      />
    </TableHead>
  );
}

type CsvRow = { id: string } & Record<string, string | number | null | undefined>;

/**
 * Sticky action bar shown once ≥1 row is selected: Export CSV (of the selected
 * rows) and, when permitted, Delete selected (routed through bulkDelete).
 */
export function BulkBar({
  entity,
  entityLabel,
  csvRows,
  filename,
  canDelete,
}: {
  entity: string;
  entityLabel: string;
  csvRows: CsvRow[];
  filename: string;
  canDelete: boolean;
}) {
  const { selected, clear } = useSel();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const count = selected.size;
  if (count === 0) return null;

  function exportCsv() {
    const rows = csvRows.filter((r) => selected.has(String(r.id)));
    if (!rows.length) return;
    const cols = Object.keys(rows[0]).filter((c) => c !== "id");
    const esc = (v: unknown) => {
      let s = v == null ? "" : String(v);
      // Neutralize spreadsheet formula injection: a cell beginning with = + - @
      // (or a control char) can execute when opened in Excel/Sheets. Prefix ' .
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length > 1 ? "s" : ""}`);
  }

  async function onDelete() {
    if (!window.confirm(`Delete ${count} ${entityLabel}${count > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await bulkDelete(entity, Array.from(selected));
    setDeleting(false);
    if (res.deleted > 0) toast.success(`Deleted ${res.deleted} ${entityLabel}${res.deleted > 1 ? "s" : ""}`);
    if (res.failed > 0) toast.error(`${res.failed} couldn't be deleted${res.error ? `: ${res.error}` : ""}`);
    clear();
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium">{count} selected</span>
      <Button variant="ghost" size="sm" onClick={clear} className="h-8">
        <X className="h-4 w-4 mr-1" />Clear
      </Button>
      <div className="flex-1" />
      <Button variant="outline" size="sm" onClick={exportCsv} className="h-8">
        <Download className="h-4 w-4 mr-2" />Export CSV
      </Button>
      {canDelete && (
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting} className="h-8">
          {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
          Delete selected
        </Button>
      )}
    </div>
  );
}
