"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
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
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
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
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
