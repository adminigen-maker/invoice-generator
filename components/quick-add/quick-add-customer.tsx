"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickCreateCustomer, type QuickCustomer } from "@/app/(app)/customers/actions";

type Opt = { id: string; label: string };

export function QuickAddCustomer({
  open,
  onClose,
  taxes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  taxes: Opt[];
  onCreated: (item: QuickCustomer) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState("30");
  const [taxId, setTaxId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await quickCreateCustomer({
      name,
      email: email || null,
      phone: phone || null,
      payment_terms_days: Number(terms) || 30,
      default_tax_id: taxId || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Customer created");
    onCreated(res.item);
    setName("");
    setEmail("");
    setPhone("");
    setTerms("30");
    setTaxId("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New customer" description="Add without leaving this form">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Payment terms (days)</Label>
            <Input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Default tax</Label>
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
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create customer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
