"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickCreateUom, type QuickUom } from "@/app/(app)/purchase-orders/uom-actions";

export function QuickAddUom({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: QuickUom) => void }) {
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await quickCreateUom({ code, name });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Unit created");
    onCreated(res.item);
    setCode("");
    setName("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New unit" description="Add a unit of measure">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Code <span className="text-destructive">*</span></Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus placeholder="e.g. CTN" />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Carton" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !code.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create unit</Button>
        </div>
      </form>
    </Dialog>
  );
}
