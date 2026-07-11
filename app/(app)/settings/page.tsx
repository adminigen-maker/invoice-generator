import { createClient } from "@/lib/db/supabase-server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: company }, { data: sequences }] = await Promise.all([
    supabase.from("company").select("*").maybeSingle(),
    supabase.from("document_sequence").select("*").order("code"),
  ]);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company</CardTitle>
          <CardDescription>Used on every printed document</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Name:</span> {company?.name}</div>
          <div><span className="text-muted-foreground">Currency:</span> {company?.currency}</div>
          <div><span className="text-muted-foreground">Country:</span> {company?.country}</div>
          <div><span className="text-muted-foreground">TRN:</span> {company?.tax_registration_number ?? "—"}</div>
          <p className="mt-3 text-muted-foreground text-xs">
            Editing UI ships in the next iteration. For now, update the <code className="rounded bg-muted px-1">company</code> row directly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document numbering</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">Sequence</th><th>Format</th><th className="text-right">Next</th></tr>
            </thead>
            <tbody>
              {(sequences ?? []).map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1.5 font-mono text-xs">{s.code}</td>
                  <td className="font-mono text-xs">{s.format}</td>
                  <td className="text-right font-mono">{s.next_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
