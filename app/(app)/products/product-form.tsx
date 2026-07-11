"use client";

import { useActionState } from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, updateProduct } from "./actions";

type Option = { id: string; label: string };

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
};

type Props = {
  initial?: ProductFormValues;
  uoms: Option[];
  taxes: Option[];
  categories: Option[];
  canViewCost: boolean;
};

export function ProductForm({ initial, uoms, taxes, categories, canViewCost }: Props) {
  const isEdit = !!initial?.id;
  const action = isEdit
    ? updateProduct.bind(null, initial!.id!)
    : createProduct;
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state && "ok" in state && !state.ok) toast.error(state.error);
    if (state && "ok" in state && state.ok && isEdit) toast.success("Saved");
  }, [state, isEdit]);

  return (
    <form action={formAction} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <Field label="SKU" required><Input name="sku" defaultValue={initial?.sku ?? ""} required /></Field>
      <Field label="Name" required><Input name="name" defaultValue={initial?.name ?? ""} required /></Field>

      <Field label="Category" span={2}>
        <Select name="category_id" defaultValue={initial?.category_id ?? ""} options={categories} placeholder="(uncategorized)" />
      </Field>

      <Field label="Unit of measure" required>
        <Select name="uom_id" defaultValue={initial?.uom_id ?? ""} options={uoms} required />
      </Field>
      <Field label="Tax">
        <Select name="tax_id" defaultValue={initial?.tax_id ?? ""} options={taxes} placeholder="(no tax)" />
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

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
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

function Select({
  name, defaultValue, options, placeholder, required,
}: { name: string; defaultValue?: string; options: Option[]; placeholder?: string; required?: boolean }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">{placeholder ?? "— select —"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}
