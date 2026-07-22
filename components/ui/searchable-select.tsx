"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string };

type Pos = { top: number; left: number; width: number; up: boolean };

/**
 * Dropdown with a built-in search box. The panel is rendered in a PORTAL on
 * document.body and positioned with fixed coordinates, so it is never clipped
 * by an overflow container (e.g. the horizontally-scrolling line-item tables).
 * Keeps a hidden input so it still works inside plain FormData forms.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— select —",
  name,
  disabled,
  required,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const shown = filtered.slice(0, 100);

  function reposition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelH = 300;
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < panelH && r.top > spaceBelow;
    setPos({ top: up ? r.top : r.bottom, left: r.left, width: r.width, up });
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    reposition();
    setQ("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onMove() {
      reposition();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true); // capture → catches inner scrolls too
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70",
          triggerClassName
        )}
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              zIndex: 60,
              ...(pos.up
                ? { bottom: window.innerHeight - pos.top + 4 }
                : { top: pos.top + 4 }),
            }}
            className="rounded-md border bg-popover text-popover-foreground shadow-lg"
          >
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
              {shown.map((o) => (
                <li key={o.value}>
                  <button type="button" onClick={() => choose(o.value)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent">
                    <Check className={cn("h-3.5 w-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-2 text-muted-foreground">No match for “{q}”.</li>}
              {filtered.length > shown.length && (
                <li className="px-3 py-1.5 text-xs text-muted-foreground">
                  Showing first {shown.length} of {filtered.length} — keep typing to narrow.
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
