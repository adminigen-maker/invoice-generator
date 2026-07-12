"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickCreateProduct, type QuickProduct } from "@/app/(app)/products/actions";

type Opt = { id: string; label: string };

export function QuickAddProduct({
  open,
  onClose,
  uoms,
  taxes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  uoms: Opt[];
  taxes: Opt[];
  onCreated: (item: QuickProduct) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [uomId, setUomId] = useState(uoms[0]?.id ?? "");
  const [price, setPrice] = useState("0");
  const [taxId, setTaxId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await quickCreateProduct({
      sku: "",
      name,
      uom_id: uomId,
      sale_price: Number(price) || 0,
      tax_id: taxId || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Product created");
    onCreated(res.item);
    setName("");
    setPrice("0");
    setTaxId("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New product" description="Add without leaving this form">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Unit <span className="text-destructive">*</span></Label>
            <select
              value={uomId}
              onChange={(e) => setUomId(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {uoms.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">SKU is generated automatically on save.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Sale price</Label>
            <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax</Label>
            <select
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— none —</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim() || !uomId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create product
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
