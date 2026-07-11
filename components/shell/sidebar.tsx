"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { P } from "@/lib/rbac/permissions";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: string;                    // one perm from the set is enough
  section?: string;
};

const NAV: NavItem[] = [
  { section: "Overview", label: "Dashboard",    href: "/",                icon: LayoutDashboard },

  { section: "Sales",    label: "Customers",    href: "/customers",       icon: Users,        perm: P.sales.customerView },
  { section: "Sales",    label: "Quotations",   href: "/quotations",      icon: FileText,     perm: P.sales.quotationView },
  { section: "Sales",    label: "Sales Orders", href: "/sales-orders",    icon: ClipboardList, perm: P.sales.orderView },

  { section: "Fulfilment", label: "Delivery Notes", href: "/delivery-notes", icon: Truck,     perm: P.inventory.deliveryView },
  { section: "Fulfilment", label: "Products",       href: "/products",       icon: Package,   perm: P.inventory.productView },

  { section: "Finance",  label: "Invoices",     href: "/invoices",        icon: Receipt,      perm: P.invoice.view },
  { section: "Finance",  label: "Payments",     href: "/payments",        icon: CircleDollarSign, perm: P.invoice.paymentView },

  { section: "Admin",    label: "Roles & Users", href: "/settings/roles", icon: Shield,       perm: P.admin.rolesView },
  { section: "Admin",    label: "Settings",     href: "/settings",        icon: Settings,     perm: P.admin.companyEdit },
];

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const permSet = new Set(permissions);
  const visible = NAV.filter((n) => !n.perm || permSet.has(n.perm));

  const sections = new Map<string, NavItem[]>();
  for (const item of visible) {
    const key = item.section ?? "Other";
    const arr = sections.get(key) ?? [];
    arr.push(item);
    sections.set(key, arr);
  }

  return (
    <aside className="w-60 shrink-0 border-r bg-background flex flex-col">
      <div className="h-14 flex items-center px-5 border-b">
        <Link href="/" className="font-semibold tracking-tight">
          Invoice <span className="text-muted-foreground">UAE</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-6 text-sm">
        {Array.from(sections.entries()).map(([section, items]) => (
          <div key={section}>
            <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section}
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
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
    </aside>
  );
}
