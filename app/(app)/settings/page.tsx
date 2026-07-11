import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SequencesEditor } from "./sequences-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: company }, { data: sequences }, canEditSequences] = await Promise.all([
    supabase.from("company").select("*").maybeSingle(),
    supabase.from("document_sequence").select("*").order("code"),
    can(P.admin.sequenceEdit),
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

      <SequencesEditor sequences={sequences ?? []} canEdit={canEditSequences} />
    </div>
  );
}
