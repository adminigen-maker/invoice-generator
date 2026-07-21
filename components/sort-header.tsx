"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A sortable column header. Drives ?sort= / ?dir= in the URL so the ordering is
 * applied by the database (not just to the rows already on screen), then the
 * server component re-renders with the new order.
 */
export function SortHeader({
  column,
  children,
  className,
}: {
  column: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = params.get("sort") === column;
  const ascending = params.get("dir") === "asc";

  function toggle() {
    const sp = new URLSearchParams(params.toString());
    sp.set("sort", column);
    // First click sorts ascending; clicking the active column flips it.
    sp.set("dir", active && ascending ? "desc" : "asc");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const Icon = !active ? ChevronsUpDown : ascending ? ArrowUp : ArrowDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={toggle}
        title={`Sort by ${typeof children === "string" ? children : column}`}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors",
          active && "text-foreground font-semibold"
        )}
      >
        {children}
        <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}
