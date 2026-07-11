"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "./nav-config";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";

const KEY = "invoice-uae:sidebar-collapsed";

export function AppShell({
  permissions,
  userName,
  userEmail,
  children,
}: {
  permissions: string[];
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  // Default open; remember the user's choice across sessions.
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      /* private mode */
    }
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar — collapsible. Hidden below md (the drawer takes over). */}
      <aside
        className={cn(
          "hidden md:flex shrink-0 bg-background flex-col overflow-hidden",
          ready && "transition-[width] duration-200 ease-in-out",
          collapsed ? "w-0 border-r-0" : "w-60 border-r"
        )}
      >
        <div className="h-14 flex items-center px-5 border-b shrink-0 w-60">
          <Link href="/" className="font-semibold tracking-tight whitespace-nowrap">
            Invoice <span className="text-muted-foreground">UAE</span>
          </Link>
        </div>
        <div className="flex flex-1 flex-col min-h-0 w-60">
          <SidebarContent permissions={permissions} />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b bg-background flex items-center px-3 sm:px-6 justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {/* Mobile drawer trigger (below md) */}
            <MobileNav permissions={permissions} />
            {/* Desktop collapse toggle (md and up) */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex -ml-2"
              onClick={toggle}
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              title={collapsed ? "Show sidebar" : "Hide sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            <div className="text-sm text-muted-foreground truncate">
              <span className="hidden sm:inline">Signed in as </span>
              <span className="text-foreground font-medium">{userName}</span>
              <span className="mx-2 hidden lg:inline">·</span>
              <span className="hidden lg:inline">{userEmail}</span>
            </div>
          </div>
          <SignOutButton />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
