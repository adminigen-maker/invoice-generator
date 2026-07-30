"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickAddCategory } from "@/components/quick-add/quick-add-category";
import { createProduct, updateProduct } from "./actions";

type Option = { id: string; label: string };

export type ProductUomValue = {
  uom_id: string;
  factor: number | string;
  sale_price: number | string;
  cost_price: number | string;
};

// Editable row in the "Additional units & prices" table (client state).
type UomRow = { key: string; uom_id: string; factor: string; sale_price: string; cost_price: string };

export type ProductFormValues = {
  id?: string;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  category_id?: string | null;
  uom_id?: string | null;
  cost_price?: number | string | null;
  sale_price?: number | string | null;
  tax_id?: string | null;
  reorder_point?: number | string | null;
  is_stockable?: boolean | null;
  is_active?: boolean | null;
  extraUoms?: ProductUomValue[];
};

type Props = {
  initial?: ProductFormValues;
  uoms: Option[];
  taxes: Option[];
  categories: Option[];
  canViewCost: boolean;
};

export function ProductForm({ initial, uoms, taxes, categories: categoriesInit, canViewCost }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState(categoriesInit);
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [uomId, setUomId] = useState(initial?.uom_id ?? "");
  const [taxId, setTaxId] = useState(initial?.tax_id ?? "");
  const [catOpen, setCatOpen] = useState(false);

  const [extraUoms, setExtraUoms] = useState<UomRow[]>(
    (initial?.extraUoms ?? []).map((r) => ({
      key: crypto.randomUUID(),
      uom_id: r.uom_id,
      factor: String(r.factor ?? "1"),
      sale_price: String(r.sale_price ?? "0"),
      cost_price: String(r.cost_price ?? "0"),
    }))
  );
  const addUom = () =>
    setExtraUoms((p) => [...p, { key: crypto.randomUUID(), uom_id: "", factor: "1", sale_price: "0", cost_price: "0" }]);
  const removeUom = (key: string) => setExtraUoms((p) => p.filter((r) => r.key !== key));
  const updateUom = (key: string, patch: Partial<UomRow>) =>
    setExtraUoms((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // A product's extra units can't reuse its base unit.
  const uomOptionsForRows = uoms.filter((u) => u.id !== uomId).map((u) => ({ value: u.id, label: u.label }));
  const gridCols = canViewCost
    ? "md:grid-cols-[minmax(0,1fr)_110px_120px_120px_40px]"
    : "md:grid-cols-[minmax(0,1fr)_110px_120px_40px]";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    fd.set(
      "extra_uoms",
      JSON.stringify(
        extraUoms
          .filter((r) => r.uom_id)
          .map((r) => ({ uom_id: r.uom_id, factor: r.factor, sale_price: r.sale_price, cost_price: r.cost_price }))
      )
    );
    const res = isEdit ? await updateProduct(initial!.id!, fd) : await createProduct(fd);
    if (!res.ok) {
      setSaving(false);
      toast.error(res.error);
      return;
    }
    toast.success(isEdit ? "Product updated" : "Product created");
    // Go to the list so the record shows immediately; keep the spinner until
    // navigation completes (the list has its own loading skeleton).
    router.push("/products");
    router.refresh();
  }

  const pending = saving;

  return (
    <>
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <Field label="SKU">
        {isEdit ? (
          <>
            <Input value={initial?.sku ?? ""} disabled readOnly />
            <input type="hidden" name="sku" value={initial?.sku ?? ""} />
          </>
        ) : (
          <Input disabled value="" placeholder="Generated automatically on save (SKU‑…)" />
        )}
      </Field>
      <Field label="Name" required><Input name="name" defaultValue={initial?.name ?? ""} required /></Field>

      <Field label="Category" span={2}>
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchableSelect
              name="category_id"
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((o) => ({ value: o.id, label: o.label }))}
              placeholder="(uncategorized)"
            />
          </div>
          <Button type="button" variant="outline" size="icon" className="shrink-0" title="Add new category" onClick={() => setCatOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      <Field label="Unit of measure" required>
        <SearchableSelect
          name="uom_id"
          value={uomId}
          onChange={setUomId}
          options={uoms.map((o) => ({ value: o.id, label: o.label }))}
          placeholder="— select —"
          required
        />
      </Field>
      <Field label="Tax">
        <SearchableSelect
          name="tax_id"
          value={taxId}
          onChange={setTaxId}
          options={taxes.map((o) => ({ value: o.id, label: o.label }))}
          placeholder="(no tax)"
        />
      </Field>

      <Field label="Sale price">
        <Input name="sale_price" type="number" step="0.01" min="0" defaultValue={initial?.sale_price?.toString() ?? "0"} />
      </Field>
      {canViewCost && (
        <Field label="Cost price">
          <Input name="cost_price" type="number" step="0.01" min="0" defaultValue={initial?.cost_price?.toString() ?? "0"} />
        </Field>
      )}

      <Field label="Reorder point">
        <Input name="reorder_point" type="number" step="0.01" min="0" defaultValue={initial?.reorder_point?.toString() ?? ""} />
      </Field>

      <Field label="Description" span={2}>
        <Textarea name="description" defaultValue={initial?.description ?? ""} rows={3} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_stockable" defaultChecked={initial?.is_stockable ?? true} />
        Track stock (uncheck for service items)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />
        Active
      </label>

      <div className="md:col-span-2 space-y-2 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label>Additional units &amp; prices</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sell this product in bigger units too. <span className="font-medium">Base units</span> = how many of the
              base unit make one of this unit (e.g. 1 Box = 12). The price above is the base‑unit price.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addUom}>
            <Plus className="h-4 w-4 mr-1" />Add unit
          </Button>
        </div>

        {extraUoms.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className={`hidden md:grid ${gridCols} gap-2 px-1 text-xs text-muted-foreground`}>
              <span>Unit</span>
              <span>Base units</span>
              <span>Sale price</span>
              {canViewCost && <span>Cost price</span>}
              <span />
            </div>
            {extraUoms.map((row) => (
              <div key={row.key} className={`grid grid-cols-2 ${gridCols} gap-2 items-center`}>
                <div className="col-span-2 md:col-span-1">
                  <SearchableSelect
                    value={row.uom_id}
                    onChange={(v) => updateUom(row.key, { uom_id: v })}
                    options={uomOptionsForRows}
                    placeholder="— unit —"
                  />
                </div>
                <Input type="number" step="0.000001" min="0" value={row.factor}
                  onChange={(e) => updateUom(row.key, { factor: e.target.value })} placeholder="12" aria-label="Base units" />
                <Input type="number" step="0.01" min="0" value={row.sale_price}
                  onChange={(e) => updateUom(row.key, { sale_price: e.target.value })} aria-label="Sale price" />
                {canViewCost && (
                  <Input type="number" step="0.01" min="0" value={row.cost_price}
                    onChange={(e) => updateUom(row.key, { cost_price: e.target.value })} aria-label="Cost price" />
                )}
                <Button type="button" variant="ghost" size="icon" className="shrink-0"
                  onClick={() => removeUom(row.key)} title="Remove unit">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>

    <QuickAddCategory
      open={catOpen}
      onClose={() => setCatOpen(false)}
      onCreated={(item) => {
        setCategories((prev) => [...prev, item]);
        setCategoryId(item.id);
      }}
    />
    </>
  );
}

function Field({
  label, required, span, children,
}: { label: string; required?: boolean; span?: 2; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? "md:col-span-2" : ""}`}>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

