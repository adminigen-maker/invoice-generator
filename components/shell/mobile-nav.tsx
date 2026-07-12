"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "./nav-config";

/** Hamburger + slide-in drawer shown only below the md breakpoint. */
export function MobileNav({ permissions }: { permissions: string[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden -ml-2"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[80%] bg-slate-900 text-slate-100 border-r border-slate-800 shadow-xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
              <Link href="/" className="font-semibold tracking-tight" onClick={() => setOpen(false)}>
                Invoice <span className="text-slate-400">UAE</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent permissions={permissions} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
