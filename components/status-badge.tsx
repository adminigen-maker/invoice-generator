import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; variant: "default" | "success" | "warning" | "info" | "secondary" | "destructive" }> = {
  draft:                { label: "Draft",               variant: "secondary" },
  sent:                 { label: "Sent",                variant: "info" },
  confirmed:            { label: "Confirmed",           variant: "info" },
  partially_delivered:  { label: "Partially delivered", variant: "warning" },
  delivered:            { label: "Delivered",           variant: "info" },
  partially_invoiced:   { label: "Partially invoiced",  variant: "warning" },
  invoiced:             { label: "Invoiced",            variant: "info" },
  partially_paid:       { label: "Partially paid",      variant: "warning" },
  paid:                 { label: "Paid",                variant: "success" },
  overdue:              { label: "Overdue",             variant: "destructive" },
  cancelled:            { label: "Cancelled",           variant: "destructive" },
  closed:               { label: "Closed",              variant: "secondary" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const m = map[status ?? ""] ?? { label: status ?? "—", variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
