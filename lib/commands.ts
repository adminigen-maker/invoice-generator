import { P } from "@/lib/rbac/permissions";

// Central catalog for the command palette (⌘K) and the shortcuts cheatsheet.
// Each command is a create or navigate action, gated by an optional permission.
//
// Two shortcut styles:
//  • seqKey — a leader-key SEQUENCE: "c" then <seqKey> for Create, "g" then
//    <seqKey> for Go to. No modifier, so keyboard layout / AltGr never eats it.
//  • hotkey — a direct Ctrl+Alt+<hotkey> (⌃⌥ on Mac). Convenient, but AltGr
//    layouts intercept some letters — the sequence is the reliable path.
export type Command = {
  id: string;
  label: string;
  href: string;
  group: "Create" | "Go to";
  perm?: string;
  keywords?: string;
  seqKey: string;    // 2nd key of the leader sequence (unique within its group)
  hotkey?: string;   // optional direct Ctrl+Alt+<letter> (Create only)
};

export const COMMANDS: Command[] = [
  // Create — leader "c". Direct combo Ctrl+Alt+<hotkey> too.
  { id: "new-quotation", label: "New quotation", href: "/quotations/new", group: "Create", perm: P.sales.quotationCreate, keywords: "quote add", seqKey: "q", hotkey: "q" },
  { id: "new-invoice", label: "New invoice", href: "/invoices/new", group: "Create", perm: P.invoice.create, keywords: "bill add", seqKey: "i", hotkey: "i" },
  { id: "new-product", label: "New product", href: "/products/new", group: "Create", perm: P.inventory.productCreate, keywords: "item sku add", seqKey: "p", hotkey: "p" },
  { id: "new-customer", label: "New customer", href: "/customers/new", group: "Create", perm: P.sales.customerCreate, keywords: "client add", seqKey: "c", hotkey: "c" },
  { id: "new-vendor", label: "New vendor", href: "/vendors/new", group: "Create", perm: P.procurement.vendorCreate, keywords: "supplier add", seqKey: "v", hotkey: "v" },
  { id: "new-po", label: "New purchase order", href: "/purchase-orders/new", group: "Create", perm: P.procurement.poCreate, keywords: "po buy purchase add", seqKey: "o", hotkey: "o" },

  // Go to — leader "g". Sequence only (too many pages for safe direct combos).
  { id: "go-dashboard", label: "Dashboard", href: "/", group: "Go to", keywords: "home", seqKey: "d" },
  { id: "go-reports", label: "Reports", href: "/reports", group: "Go to", perm: P.invoice.view, seqKey: "r" },
  { id: "go-quotations", label: "Quotations", href: "/quotations", group: "Go to", perm: P.sales.quotationView, seqKey: "q" },
  { id: "go-orders", label: "Sales Orders", href: "/sales-orders", group: "Go to", perm: P.sales.orderView, seqKey: "o" },
  { id: "go-deliveries", label: "Delivery Notes", href: "/delivery-notes", group: "Go to", perm: P.inventory.deliveryView, seqKey: "n" },
  { id: "go-pos", label: "Purchase Orders", href: "/purchase-orders", group: "Go to", perm: P.procurement.poView, seqKey: "u" },
  { id: "go-invoices", label: "Invoices", href: "/invoices", group: "Go to", perm: P.invoice.view, seqKey: "i" },
  { id: "go-payments", label: "Payments", href: "/payments", group: "Go to", perm: P.invoice.paymentView, seqKey: "y" },
  { id: "go-credits", label: "Returns / Credits", href: "/credit-notes", group: "Go to", perm: P.invoice.creditNoteView, seqKey: "k" },
  { id: "go-products", label: "Products", href: "/products", group: "Go to", perm: P.inventory.productView, seqKey: "p" },
  { id: "go-inventory", label: "Inventory", href: "/inventory", group: "Go to", perm: P.inventory.stockView, seqKey: "v" },
  { id: "go-customers", label: "Customers", href: "/customers", group: "Go to", perm: P.sales.customerView, seqKey: "c" },
  { id: "go-vendors", label: "Vendors", href: "/vendors", group: "Go to", perm: P.procurement.vendorView, seqKey: "e" },
  { id: "go-settings", label: "Settings", href: "/settings", group: "Go to", perm: P.admin.companyEdit, seqKey: "s" },
];

export const LEADER: Record<Command["group"], string> = { Create: "c", "Go to": "g" };

/** Commands the user is allowed to run, given their permission codes. */
export function allowedCommands(permissions: string[]): Command[] {
  const set = new Set(permissions);
  return COMMANDS.filter((c) => !c.perm || set.has(c.perm));
}

/** The leader + second key for a command, e.g. ["G", "P"]. */
export function seqKeys(c: Command): [string, string] {
  return [LEADER[c.group].toUpperCase(), c.seqKey.toUpperCase()];
}

/** Human label for a command's direct combo, e.g. "Ctrl+Alt+P" / "⌃⌥P". */
export function hotkeyLabel(letter: string, isMac: boolean): string {
  return (isMac ? "⌃⌥" : "Ctrl+Alt+") + letter.toUpperCase();
}
