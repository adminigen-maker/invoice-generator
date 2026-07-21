"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { quickCreateVendor, type QuickVendor } from "@/app/(app)/vendors/actions";

type Opt = { id: string; label: string };

/** Same detail as the Vendors master form (code is auto-generated on save). */
export function QuickAddVendor({
  open, onClose, onCreated, taxes = [],
}: { open: boolean; onClose: () => void; onCreated: (v: QuickVendor) => void; taxes?: Opt[] }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [trn, setTrn] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState("30");
  const [taxId, setTaxId] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await quickCreateVendor({
      name,
      legal_name: legalName || null,
      tax_registration_number: trn || null,
      email: email || null,
      phone: phone || null,
      payment_terms_days: Number(terms) || 0,
      default_tax_id: taxId || null,
      currency: currency || "AED",
      notes: notes || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Vendor created");
    onCreated(res.item);
    setName(""); setLegalName(""); setTrn(""); setEmail(""); setPhone("");
    setTerms("30"); setTaxId(""); setCurrency("AED"); setNotes("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New vendor" description="Code is generated automatically on save.">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Vendor / supplier name" />
        </div>
        <div className="space-y-1.5">
          <Label>Legal name</Label>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tax Registration Number (TRN)</Label>
            <Input value={trn} onChange={(e) => setTrn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Default tax</Label>
            <SearchableSelect
              value={taxId}
              onChange={setTaxId}
              options={taxes.map((t) => ({ value: t.id, label: t.label }))}
              placeholder="— none —"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Payment terms (days)</Label>
            <Input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create vendor</Button>
        </div>
      </form>
    </Dialog>
  );
}
