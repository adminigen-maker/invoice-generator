"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string };

/**
 * Dropdown with a built-in search box. Keeps a hidden input so it still works
 * inside plain FormData forms, and closes on outside click / Escape.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— select —",
  name,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative" ref={ref}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-8 w-full rounded border border-input bg-background pl-7 pr-2 text-sm"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1 text-sm">
            <li>
              <button type="button" onClick={() => choose("")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground hover:bg-accent">
                <Check className={cn("h-3.5 w-3.5", value === "" ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{placeholder}</span>
              </button>
            </li>
            {filtered.map((o) => (
              <li key={o.value}>
                <button type="button" onClick={() => choose(o.value)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent">
                  <Check className={cn("h-3.5 w-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-muted-foreground">No match for “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
