import { Card, CardContent } from "@/components/ui/card";

/** A labeled meta grid (Customer / Date / … ) shown at the top of a document. */
export function DocMetaGrid({ items }: { items: { label: string; value: React.ReactNode; danger?: boolean }[] }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
        {items.map((m, i) => (
          <div key={i} className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className={`text-sm font-medium ${m.danger ? "text-destructive" : ""}`}>{m.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

/** A row of headline stat cards. */
export function DocStatGrid({ items }: { items: { label: string; value: string; tone?: "success" | "danger" }[] }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${COLS[items.length] ?? "sm:grid-cols-3"}`}>
      {items.map((s, i) => {
        const color = s.tone === "success" ? "text-emerald-600" : s.tone === "danger" ? "text-destructive" : "";
        return (
          <Card key={i}>
            <CardContent className="pt-6 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className={`mt-1 text-2xl font-semibold tracking-tight font-mono ${color}`}>{s.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
