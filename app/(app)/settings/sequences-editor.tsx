"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewDocumentNumber } from "@/lib/document-number";
import { updateSequence } from "./actions";

export type Sequence = {
  id: string;
  code: string;
  prefix: string;
  format: string;
  padding: number;
  next_number: number;
  reset_yearly: boolean;
};

export function SequencesEditor({ sequences, canEdit }: { sequences: Sequence[]; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Document numbering</CardTitle>
        <CardDescription>
          {canEdit ? "Edit the prefix, format, and next number for each document. " : "Read-only. "}
          Tokens: <code className="rounded bg-muted px-1">{"{PREFIX}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{YYYY}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{MM}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{SEQ}"}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2 pr-3 font-medium">Document</th>
              <th className="py-2 pr-3 font-medium w-24">Prefix</th>
              <th className="py-2 pr-3 font-medium">Format</th>
              <th className="py-2 pr-3 font-medium w-16">Pad</th>
              <th className="py-2 pr-3 font-medium w-24">Next #</th>
              <th className="py-2 pr-3 font-medium w-16">Yearly</th>
              <th className="py-2 pr-3 font-medium">Preview</th>
              {canEdit && <th className="py-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {sequences.map((s) => (
              <SequenceRow key={s.id} seq={s} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SequenceRow({ seq, canEdit }: { seq: Sequence; canEdit: boolean }) {
  const [prefix, setPrefix] = useState(seq.prefix);
  const [format, setFormat] = useState(seq.format);
  const [padding, setPadding] = useState(String(seq.padding));
  const [nextNumber, setNextNumber] = useState(String(seq.next_number));
  const [resetYearly, setResetYearly] = useState(seq.reset_yearly);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({
    prefix: seq.prefix,
    format: seq.format,
    padding: seq.padding,
    next_number: seq.next_number,
    reset_yearly: seq.reset_yearly,
  });

  const dirty =
    prefix !== saved.prefix ||
    format !== saved.format ||
    Number(padding) !== saved.padding ||
    Number(nextNumber) !== saved.next_number ||
    resetYearly !== saved.reset_yearly;

  async function save() {
    setSaving(true);
    const res = await updateSequence({
      id: seq.id,
      prefix,
      format,
      padding,
      next_number: nextNumber,
      reset_yearly: resetYearly,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSaved({
      prefix,
      format,
      padding: Number(padding),
      next_number: Number(nextNumber),
      reset_yearly: resetYearly,
    });
    toast.success(`${seq.code} numbering saved`);
  }

  const disabled = !canEdit || saving;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{seq.code}</td>
      <td className="py-2 pr-3">
        <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={disabled} className="h-8" />
      </td>
      <td className="py-2 pr-3">
        <Input value={format} onChange={(e) => setFormat(e.target.value)} disabled={disabled} className="h-8 font-mono text-xs" />
      </td>
      <td className="py-2 pr-3">
        <Input type="number" min="1" max="12" value={padding} onChange={(e) => setPadding(e.target.value)} disabled={disabled} className="h-8" />
      </td>
      <td className="py-2 pr-3">
        <Input type="number" min="1" value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} disabled={disabled} className="h-8" />
      </td>
      <td className="py-2 pr-3 text-center">
        <input
          type="checkbox"
          checked={resetYearly}
          onChange={(e) => setResetYearly(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-primary"
        />
      </td>
      <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
        {previewDocumentNumber(prefix, format, Number(padding), Number(nextNumber))}
      </td>
      {canEdit && (
        <td className="py-2">
          <Button type="button" size="sm" onClick={save} disabled={!dirty || saving} className="h-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </td>
      )}
    </tr>
  );
}
