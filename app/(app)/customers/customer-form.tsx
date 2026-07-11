"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCustomer, updateCustomer } from "./actions";

type Option = { id: string; label: string };
export type CustomerValues = {
  id?: string;
  code?: string | null;
  name?: string | null;
  legal_name?: string | null;
  tax_registration_number?: string | null;
  email?: string | null;
  phone?: string | null;
  credit_limit?: number | string | null;
  payment_terms_days?: number | string | null;
  default_tax_id?: string | null;
  currency?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
};

export function CustomerForm({ initial, taxes }: { initial?: CustomerValues; taxes: Option[] }) {
  const isEdit = !!initial?.id;
  const action = isEdit ? updateCustomer.bind(null, initial!.id!) : createCustomer;
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state && "ok" in state && !state.ok) toast.error(state.error);
    if (state && "ok" in state && state.ok && isEdit) toast.success("Saved");
  }, [state, isEdit]);

  return (
    <form action={formAction} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <Field label="Code"><Input name="code" defaultValue={initial?.code ?? ""} placeholder="auto-generated" /></Field>
      <Field label="Currency"><Input name="currency" defaultValue={initial?.currency ?? "AED"} /></Field>

      <Field label="Name" required span={2}><Input name="name" required defaultValue={initial?.name ?? ""} /></Field>
      <Field label="Legal name" span={2}><Input name="legal_name" defaultValue={initial?.legal_name ?? ""} /></Field>

      <Field label="Tax Registration Number (TRN)">
        <Input name="tax_registration_number" defaultValue={initial?.tax_registration_number ?? ""} />
      </Field>
      <Field label="Default tax">
        <select name="default_tax_id" defaultValue={initial?.default_tax_id ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">— none —</option>
          {taxes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Field>

      <Field label="Email"><Input name="email" type="email" defaultValue={initial?.email ?? ""} /></Field>
      <Field label="Phone"><Input name="phone" defaultValue={initial?.phone ?? ""} /></Field>

      <Field label="Credit limit">
        <Input name="credit_limit" type="number" step="0.01" min="0" defaultValue={initial?.credit_limit?.toString() ?? "0"} />
      </Field>
      <Field label="Payment terms (days)">
        <Input name="payment_terms_days" type="number" min="0" defaultValue={initial?.payment_terms_days?.toString() ?? "30"} />
      </Field>

      <Field label="Notes" span={2}><Textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} /></Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />
        Active
      </label>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, span, children }: { label: string; required?: boolean; span?: 2; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? "md:col-span-2" : ""}`}>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}
