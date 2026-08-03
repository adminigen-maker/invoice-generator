"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { allowedCommands, hotkeyLabel, type Command } from "@/lib/commands";
import { ShortcutsReference } from "@/components/shortcuts-reference";

/** True when focus is in a text field — so global single-key shortcuts don't fire mid-typing. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function CommandPalette({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setIsMac(/mac/i.test(navigator.platform)), []);

  const cmds = useMemo(() => allowedCommands(permissions), [permissions]);
  const cmdsRef = useRef(cmds);
  cmdsRef.current = cmds;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cmds;
    return cmds.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [cmds, query]);

  // Global hotkeys: ⌘K / Ctrl+K toggles the palette; "?" opens help (not while typing).
  // A "cmdk:open" custom event lets the header button open it too.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "?" && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && !isTypingTarget(e.target)) {
        // Direct Ctrl+Alt+<letter> (⌃⌥ on Mac). Match the physical key (e.code)
        // so it works regardless of AltGr/keyboard layout output.
        const cmd = cmdsRef.current.find((c) => c.hotkey && e.code === "Key" + c.hotkey.toUpperCase());
        if (cmd) {
          e.preventDefault();
          setOpen(false);
          router.push(cmd.href);
        }
      }
    }
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onOpenEvent as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onOpenEvent as EventListener);
    };
  }, [router]);

  // Reset + focus the search box each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = useCallback((c: Command) => { setOpen(false); router.push(c.href); }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = results[active]; if (c) run(c); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={() => setOpen(false)} />
          <div
            className="relative z-10 w-full max-w-lg rounded-lg border bg-popover text-popover-foreground shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command… e.g. new product, invoices"
                className="flex-1 h-11 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
            </div>
            <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matching commands.</li>
              )}
              {results.map((c, i) => {
                const showHeader = i === 0 || results[i - 1].group !== c.group;
                return (
                  <div key={c.id}>
                    {showHeader && (
                      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.group}</div>
                    )}
                    <li
                      data-idx={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(c)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 mx-1 rounded-md cursor-pointer text-sm ${i === active ? "bg-accent" : ""}`}
                    >
                      <span>{c.label}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {c.hotkey && (
                          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {hotkeyLabel(c.hotkey, isMac)}
                          </kbd>
                        )}
                        {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                      </span>
                    </li>
                  </div>
                );
              })}
            </ul>
            <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-3">
              <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
            </div>
          </div>
        </div>
      )}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" description="Speed up common actions.">
        <ShortcutsReference permissions={permissions} isMac={isMac} />
      </Dialog>
    </>
  );
}

/** Small header button that opens the palette (discoverability for mouse users). */
export function CommandPaletteButton() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/mac/i.test(navigator.platform)), []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("cmdk:open"))}
      title="Command menu"
      className="hidden sm:flex items-center gap-2 h-8 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Search</span>
      <kbd className="ml-1 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium">{isMac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
