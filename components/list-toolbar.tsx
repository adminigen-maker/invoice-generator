"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const VIEWS = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "all", label: "All" },
];

/**
 * List toolbar: optional Active/Inactive/All view switch + a debounced search
 * box. Both drive URL query params (?view= / ?q=), which re-run the page's
 * server component with new filters.
 */
export function ListToolbar({
  showViews = true,
  searchPlaceholder = "Search…",
}: {
  showViews?: boolean;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTx] = useTransition();

  const currentView = params.get("view") ?? "active";
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  // Debounce the search into ?q=
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (q.trim()) sp.set("q", q.trim());
      else sp.delete("q");
      startTx(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setView(v: string) {
    const sp = new URLSearchParams(params.toString());
    if (v === "active") sp.delete("view");
    else sp.set("view", v);
    startTx(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      {showViews && (
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40 self-start">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                "px-3 py-1 text-sm rounded-[5px] transition-colors",
                currentView === v.key
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative sm:ml-auto w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8 pr-8"
        />
        {pending ? (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        ) : q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
