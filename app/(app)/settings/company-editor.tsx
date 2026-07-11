"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompany } from "./actions";

export type CompanyValues = {
  name?: string | null;
  legal_name?: string | null;
  tax_registration_number?: string | null;
  currency?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  bank_account?: string | null;
  logo_url?: string | null;
};

export function CompanyEditor({ company, canEdit }: { company: CompanyValues; canEdit: boolean }) {
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    const input = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await updateCompany(input);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Company profile saved");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company</CardTitle>
        <CardDescription>
          {canEdit ? "Appears on every printed invoice and quotation." : "Read-only."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Company name" required span={2}>
            <Input name="name" defaultValue={company.name ?? ""} required disabled={!canEdit} />
          </Field>
          <Field label="Legal name">
            <Input name="legal_name" defaultValue={company.legal_name ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="TRN (Tax Registration No.)">
            <Input name="tax_registration_number" defaultValue={company.tax_registration_number ?? ""} disabled={!canEdit} />
          </Field>

          <Field label="Address line 1">
            <Input name="address_line1" defaultValue={company.address_line1 ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="Address line 2">
            <Input name="address_line2" defaultValue={company.address_line2 ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={company.city ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="Country">
            <Input name="country" defaultValue={company.country ?? ""} disabled={!canEdit} />
          </Field>

          <Field label="Phone">
            <Input name="phone" defaultValue={company.phone ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="WhatsApp">
            <Input name="whatsapp" defaultValue={company.whatsapp ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={company.email ?? ""} disabled={!canEdit} />
          </Field>
          <Field label="Website">
            <Input name="website" defaultValue={company.website ?? ""} disabled={!canEdit} />
          </Field>

          <Field label="Bank account (shown on invoices)" span={2}>
            <Input name="bank_account" defaultValue={company.bank_account ?? ""} disabled={!canEdit} placeholder="0023574802001 - RAK BANK" />
          </Field>
          <Field label="Currency">
            <Input name="currency" defaultValue={company.currency ?? "AED"} disabled={!canEdit} />
          </Field>
          <Field label="Logo URL (optional)">
            <Input name="logo_url" defaultValue={company.logo_url ?? ""} disabled={!canEdit} placeholder="https://…/logo.png" />
          </Field>

          {canEdit && (
            <div className="md:col-span-2 flex justify-end pt-1">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save company"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  span?: 2;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? "md:col-span-2" : ""}`}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
