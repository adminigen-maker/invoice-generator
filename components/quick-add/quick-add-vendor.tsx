"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickCreateVendor, type QuickVendor } from "@/app/(app)/vendors/actions";

export function QuickAddVendor({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (v: QuickVendor) => void }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await quickCreateVendor({ name });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Vendor created");
    onCreated(res.item);
    setName("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New vendor" description="Add without leaving this form">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Vendor / supplier name" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create vendor</Button>
        </div>
      </form>
    </Dialog>
  );
}
