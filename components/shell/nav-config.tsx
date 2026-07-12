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
  Gauge,
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
  /** Icon accent colour (applied when the item is not the active one). */
  color: string;
  perm?: string;
  area: AreaKey;
  section: string;
};

// Items are grouped into *areas* (Dynamics-CRM style). The area switcher at the
// bottom of the sidebar decides which area's items are shown.
const NAV: NavItem[] = [
  { area: "operations", section: "Overview", label: "Dashboard", href: "/", icon: LayoutDashboard, color: "text-sky-500" },
  { area: "operations", section: "Sales", label: "Quotations", href: "/quotations", icon: FileText, color: "text-violet-500", perm: P.sales.quotationView },
  { area: "operations", section: "Sales", label: "Sales Orders", href: "/sales-orders", icon: ClipboardList, color: "text-indigo-500", perm: P.sales.orderView },
  { area: "operations", section: "Fulfilment", label: "Delivery Notes", href: "/delivery-notes", icon: Truck, color: "text-amber-500", perm: P.inventory.deliveryView },
  { area: "operations", section: "Finance", label: "Invoices", href: "/invoices", icon: Receipt, color: "text-emerald-500", perm: P.invoice.view },
  { area: "operations", section: "Finance", label: "Payments", href: "/payments", icon: CircleDollarSign, color: "text-green-600", perm: P.invoice.paymentView },

  { area: "master", section: "Catalog", label: "Products", href: "/products", icon: Package, color: "text-orange-500", perm: P.inventory.productView },
  { area: "master", section: "Partners", label: "Customers", href: "/customers", icon: Users, color: "text-cyan-600", perm: P.sales.customerView },

  { area: "admin", section: "Access", label: "Roles & Users", href: "/settings/roles", icon: Shield, color: "text-rose-500", perm: P.admin.rolesView },
  { area: "admin", section: "Configuration", label: "Settings", href: "/settings", icon: Settings, color: "text-slate-500", perm: P.admin.companyEdit },
  { area: "admin", section: "Configuration", label: "Usage & Limits", href: "/settings/usage", icon: Gauge, color: "text-teal-500", perm: P.admin.companyEdit },
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
 * to the bottom. Used by the desktop sidebar (expanded or collapsed icon rail)
 * and the mobile drawer.
 */
export function SidebarContent({
  permissions,
  onNavigate,
  collapsed = false,
}: {
  permissions: string[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const permSet = new Set(permissions);
  const visible = NAV.filter((n) => !n.perm || permSet.has(n.perm));
  const activeHref = bestMatchHref(pathname, visible);

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
      <nav className={cn("flex-1 overflow-y-auto text-sm", collapsed ? "px-2 py-3 space-y-1" : "p-3 space-y-6")}>
        {Array.from(sections.entries()).map(([section, items]) => (
          <div key={section}>
            {!collapsed && (
              <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-md transition-colors",
                        collapsed ? "justify-center h-10 w-10 mx-auto" : "gap-2.5 px-2 py-2 md:py-1.5",
                        active
                          ? "bg-white text-slate-900 font-medium shadow-sm"
                          : "text-slate-300 hover:text-white hover:bg-white/10"
                      )}
                    >
                      <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4", item.color)} />
                      {!collapsed && <span>{item.label}</span>}
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
        const ActiveIcon = active.icon;
        return (
          <div className="relative shrink-0 border-t border-slate-800 p-2">
            {/* "Change area" popup (opens upward, Dynamics-style) */}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  className={cn(
                    "absolute bottom-full mb-1 z-20 rounded-md border bg-popover text-popover-foreground shadow-lg py-1",
                    collapsed ? "left-1 w-52" : "left-2 right-2"
                  )}
                >
                  <div className="px-3 py-1.5 text-sm font-semibold">Change area</div>
                  {availableAreas.map((a) => {
                    const isActive = a.key === activeArea;
                    const AIcon = a.icon;
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
                        <AIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
              title={collapsed ? `${active.label} · change area` : undefined}
              className={cn(
                "flex items-center rounded-md hover:bg-white/10 transition-colors",
                collapsed ? "justify-center h-10 w-10 mx-auto" : "w-full gap-2.5 px-2 py-2"
              )}
            >
              {collapsed ? (
                <ActiveIcon className="h-5 w-5 text-slate-200" />
              ) : (
                <>
                  <span className="h-7 w-7 rounded bg-white/10 text-white grid place-items-center text-xs font-bold shrink-0">
                    {active.label.charAt(0)}
                  </span>
                  <span className="flex-1 text-left text-sm font-semibold truncate text-white">{active.label}</span>
                  <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
                </>
              )}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
