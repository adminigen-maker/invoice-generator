"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  ClipboardList,
  Truck,
  Receipt,
  CircleDollarSign,
  Settings,
  Shield,
  LayoutGrid,
  Database,
  Cog,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { P } from "@/lib/rbac/permissions";

type AreaKey = "operations" | "master" | "admin";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: string;
  area: AreaKey;
  section: string;
};

// Items are grouped into *areas* (Dynamics-CRM style). The area switcher at the
// bottom of the sidebar decides which area's items are shown.
const NAV: NavItem[] = [
  { area: "operations", section: "Overview", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { area: "operations", section: "Sales", label: "Quotations", href: "/quotations", icon: FileText, perm: P.sales.quotationView },
  { area: "operations", section: "Sales", label: "Sales Orders", href: "/sales-orders", icon: ClipboardList, perm: P.sales.orderView },
  { area: "operations", section: "Fulfilment", label: "Delivery Notes", href: "/delivery-notes", icon: Truck, perm: P.inventory.deliveryView },
  { area: "operations", section: "Finance", label: "Invoices", href: "/invoices", icon: Receipt, perm: P.invoice.view },
  { area: "operations", section: "Finance", label: "Payments", href: "/payments", icon: CircleDollarSign, perm: P.invoice.paymentView },

  { area: "master", section: "Catalog", label: "Products", href: "/products", icon: Package, perm: P.inventory.productView },
  { area: "master", section: "Partners", label: "Customers", href: "/customers", icon: Users, perm: P.sales.customerView },

  { area: "admin", section: "Access", label: "Roles & Users", href: "/settings/roles", icon: Shield, perm: P.admin.rolesView },
  { area: "admin", section: "Configuration", label: "Settings", href: "/settings", icon: Settings, perm: P.admin.companyEdit },
];

const AREAS: { key: AreaKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "operations", label: "Operations", icon: LayoutGrid },
  { key: "master", label: "Master Data", icon: Database },
  { key: "admin", label: "Admin", icon: Cog },
];

/** Does the path belong to this href? Uses segment boundaries so that
 *  "/settings" does NOT match "/settings/roles" (which would light up both). */
function pathMatches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The single nav href that best matches the path (longest match wins), so
 *  only ONE link is ever highlighted — the most specific one. */
function bestMatchHref(pathname: string, items: NavItem[]): string {
  let best = "";
  for (const item of items) {
    if (pathMatches(pathname, item.href) && item.href.length > best.length) best = item.href;
  }
  return best;
}

/** Which area does the current URL belong to? (longest matching href wins) */
function areaForPath(pathname: string): AreaKey {
  let best: NavItem | null = null;
  for (const item of NAV) {
    if (pathMatches(pathname, item.href) && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.area ?? "operations";
}

/**
 * Full sidebar body: area-filtered nav links on top, the area switcher pinned
 * to the bottom. Used by both the desktop sidebar and the mobile drawer.
 */
export function SidebarContent({
  permissions,
  onNavigate,
}: {
  permissions: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const permSet = new Set(permissions);
  const visible = NAV.filter((n) => !n.perm || permSet.has(n.perm));
  // Only the single most-specific link is active (fixes /settings also
  // highlighting when on /settings/roles).
  const activeHref = bestMatchHref(pathname, visible);

  // Active area follows the current route, but the switcher can override it
  // until the next navigation.
  const [area, setArea] = useState<AreaKey>(() => areaForPath(pathname));
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setArea(areaForPath(pathname)), [pathname]);
  useEffect(() => setMenuOpen(false), [pathname]);

  const availableAreas = AREAS.filter((a) => visible.some((n) => n.area === a.key));
  const activeArea = availableAreas.some((a) => a.key === area)
    ? area
    : availableAreas[0]?.key ?? "operations";

  const sections = new Map<string, NavItem[]>();
  for (const item of visible.filter((n) => n.area === activeArea)) {
    const arr = sections.get(item.section) ?? [];
    arr.push(item);
    sections.set(item.section, arr);
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <nav className="flex-1 overflow-y-auto p-3 space-y-6 text-sm">
        {Array.from(sections.entries()).map(([section, items]) => (
          <div key={section}>
            <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section}
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-2 md:py-1.5 transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {availableAreas.length > 1 && (() => {
        const active = availableAreas.find((a) => a.key === activeArea) ?? availableAreas[0];
        return (
          <div className="relative shrink-0 border-t p-2">
            {/* "Change area" popup (opens upward, Dynamics-style) */}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full left-2 right-2 mb-1 z-20 rounded-md border bg-popover text-popover-foreground shadow-lg py-1">
                  <div className="px-3 py-1.5 text-sm font-semibold">Change area</div>
                  {availableAreas.map((a) => {
                    const isActive = a.key === activeArea;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => {
                          setArea(a.key);
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                      >
                        <Check className={cn("h-4 w-4 shrink-0", isActive ? "opacity-100" : "opacity-0")} />
                        <span className={cn("flex-1 text-left", isActive && "font-medium")}>{a.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Current-area button */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="w-full flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-accent transition-colors"
            >
              <span className="h-7 w-7 rounded bg-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                {active.label.charAt(0)}
              </span>
              <span className="flex-1 text-left text-sm font-semibold truncate">{active.label}</span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        );
      })()}
    </div>
  );
}
