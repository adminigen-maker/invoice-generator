import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Page header: title + subtitle, with an optional action button on the right. */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {action && <Skeleton className="h-10 w-36" />}
    </div>
  );
}

/** A table with `rows` × `cols` shimmer cells inside a Card, matching the list pages. */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-3 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" style={{ opacity: 1 - r * 0.06 }} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Generic list-page skeleton: header + table. */
export function ListPageSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <TableSkeleton cols={cols} />
    </div>
  );
}

/** Form-page skeleton: header + a card of paired fields. */
export function FormPageSkeleton({ fields = 8 }: { fields?: number }) {
  return (
    <div className="space-y-4 max-w-4xl">
      <Skeleton className="h-7 w-56" />
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-6">
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>
    </div>
  );
}

/** Dashboard skeleton: 4 stat cards + chart cards. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[220px] w-full" />
        </Card>
        <Card className="p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[200px] w-full rounded-full max-w-[200px] mx-auto" />
        </Card>
      </div>
    </div>
  );
}

/** Document detail skeleton (sales order / invoice / delivery note): header + lines table + totals. */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <TableSkeleton rows={5} cols={5} />
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2" />
        <Card className="p-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
