import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { CompanyEditor } from "./company-editor";
import { SequencesEditor } from "./sequences-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: company }, { data: sequences }, canEditCompany, canEditSequences] = await Promise.all([
    supabase.from("company").select("*").maybeSingle(),
    supabase.from("document_sequence").select("*").order("code"),
    can(P.admin.companyEdit),
    can(P.admin.sequenceEdit),
  ]);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <CompanyEditor company={company ?? {}} canEdit={canEditCompany} />

      <SequencesEditor sequences={sequences ?? []} canEdit={canEditSequences} />
    </div>
  );
}
