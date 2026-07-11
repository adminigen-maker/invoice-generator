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

/** Which area does the current URL belong to? (longest matching href wins) */
function areaForPath(pathname: string): AreaKey {
  let best: NavItem | null = null;
  for (const item of NAV) {
    const match = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    if (match && (!best || item.href.length > best.href.length)) best = item;
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

  // Active area follows the current route, but the switcher can override it
  // until the next navigation.
  const [area, setArea] = useState<AreaKey>(() => areaForPath(pathname));
  useEffect(() => setArea(areaForPath(pathname)), [pathname]);

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
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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

      {availableAreas.length > 1 && (
        <div
          className="shrink-0 border-t p-2 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${availableAreas.length}, minmax(0, 1fr))` }}
        >
          {availableAreas.map((a) => {
            const Icon = a.icon;
            const isActive = a.key === activeArea;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setArea(a.key)}
                aria-pressed={isActive}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-2 text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
