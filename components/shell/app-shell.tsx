"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/auto-refresh";
import { InstallButton } from "@/components/install-button";
import { SidebarContent } from "./nav-config";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";

const KEY = "invoice-uae:sidebar-collapsed";

// Read-only dashboard + list views that should stay live. Forms / detail / edit
// pages are excluded so a refresh never disrupts someone mid-edit.
const LIVE_ROUTES = new Set([
  "/",
  "/products",
  "/customers",
  "/quotations",
  "/sales-orders",
  "/delivery-notes",
  "/invoices",
  "/payments",
]);

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
  const pathname = usePathname();
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
      {/* Desktop sidebar — collapses to a slim icon rail. Hidden below md
          (the drawer takes over). */}
      <aside
        className={cn(
          "hidden md:flex shrink-0 bg-background flex-col overflow-hidden border-r",
          ready && "transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="h-14 flex items-center border-b shrink-0 w-full overflow-hidden">
          <Link
            href="/"
            title="Invoice UAE"
            className={cn(
              "font-semibold tracking-tight whitespace-nowrap flex items-center",
              collapsed ? "justify-center w-full" : "px-5"
            )}
          >
            {collapsed ? (
              <span className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
                IU
              </span>
            ) : (
              <>
                Invoice <span className="text-muted-foreground ml-1">UAE</span>
              </>
            )}
          </Link>
        </div>
        <div className="flex flex-1 flex-col min-h-0 w-full">
          <SidebarContent permissions={permissions} collapsed={collapsed} />
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
          <div className="flex items-center gap-2">
            <InstallButton />
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/20">
          {LIVE_ROUTES.has(pathname) && <AutoRefresh intervalMs={30000} />}
          {children}
        </main>
      </div>
    </div>
  );
}
