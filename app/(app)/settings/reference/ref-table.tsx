"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { createRefRow, updateRefRow, deleteRefRow } from "./actions";
import type { RefConfig } from "@/lib/reference-tables";

type Row = { id: string; code?: string | null; created_at?: string | null } & Record<string, unknown>;

export function RefTable({ cfg, rows, canEdit }: { cfg: RefConfig; rows: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [addVals, setAddVals] = useState<Record<string, string>>({});

  const showCode = !!cfg.autoCode; // read-only code column for auto-coded tables
  const colSpan = cfg.fields.length + (showCode ? 1 : 0) + 2; // + created + actions

  function startEdit(row: Row) {
    setEditId(row.id);
    setEditVals(Object.fromEntries(cfg.fields.map((f) => [f.key, String(row[f.key] ?? "")])));
  }
  function save(id: string) {
    startTx(async () => {
      const res = await updateRefRow(cfg.table, id, editVals);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Saved");
      setEditId(null);
      router.refresh();
    });
  }
  function del(id: string) {
    if (!window.confirm(`Delete this ${cfg.singular}?`)) return;
    startTx(async () => {
      const res = await deleteRefRow(cfg.table, id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Deleted");
      router.refresh();
    });
  }
  function add() {
    startTx(async () => {
      const res = await createRefRow(cfg.table, addVals);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Added");
      setAddVals({});
      router.refresh();
    });
  }

  const addValid = cfg.fields.every((f) => !f.required || (addVals[f.key] ?? "").trim() !== "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{cfg.label}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {cfg.fields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              {showCode && <TableHead>Code</TableHead>}
              <TableHead>Created</TableHead>
              {canEdit && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-6">Nothing here yet.</TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const editing = editId === row.id;
              return (
                <TableRow key={row.id}>
                  {cfg.fields.map((f) => (
                    <TableCell key={f.key}>
                      {editing ? (
                        <Input
                          type={f.type === "number" ? "number" : "text"}
                          value={editVals[f.key] ?? ""}
                          onChange={(e) => setEditVals((v) => ({ ...v, [f.key]: e.target.value }))}
                          className="h-8"
                        />
                      ) : f.type === "number" ? (
                        <span className="font-mono">{Number(row[f.key] ?? 0)}</span>
                      ) : (
                        String(row[f.key] ?? "—")
                      )}
                    </TableCell>
                  ))}
                  {showCode && <TableCell className="font-mono text-xs text-muted-foreground">{row.code ?? "—"}</TableCell>}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {row.created_at ? formatDate(row.created_at) : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {editing ? (
                          <>
                            <IconBtn title="Save" onClick={() => save(row.id)} disabled={pending}><Check className="h-4 w-4 text-emerald-600" /></IconBtn>
                            <IconBtn title="Cancel" onClick={() => setEditId(null)} disabled={pending}><X className="h-4 w-4" /></IconBtn>
                          </>
                        ) : (
                          <>
                            <IconBtn title="Edit" onClick={() => startEdit(row)} disabled={pending}><Pencil className="h-4 w-4" /></IconBtn>
                            <IconBtn title="Delete" onClick={() => del(row.id)} disabled={pending} danger><Trash2 className="h-4 w-4" /></IconBtn>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}

            {canEdit && (
              <TableRow className="bg-muted/30">
                {cfg.fields.map((f, i) => (
                  <TableCell key={f.key}>
                    <Input
                      type={f.type === "number" ? "number" : "text"}
                      value={addVals[f.key] ?? ""}
                      onChange={(e) => setAddVals((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={i === 0 ? `New ${cfg.singular}…` : f.label}
                      className="h-8"
                    />
                  </TableCell>
                ))}
                {showCode && <TableCell className="text-xs text-muted-foreground">auto</TableCell>}
                <TableCell />
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={add} disabled={pending || !addValid}>
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      <span className="ml-1 hidden sm:inline">Add</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function IconBtn({ children, title, onClick, disabled, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-grid h-8 w-8 place-items-center rounded-md border text-muted-foreground disabled:opacity-50 ${
        danger ? "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40" : "hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
