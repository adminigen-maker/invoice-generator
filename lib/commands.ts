import { P } from "@/lib/rbac/permissions";

// Central catalog for the command palette (⌘K) and the shortcuts cheatsheet.
// Each command is a create or navigate action, gated by an optional permission.
export type Command = {
  id: string;
  label: string;
  href: string;
  group: "Create" | "Go to";
  perm?: string;      // required permission code (undefined = everyone)
  keywords?: string;  // extra search terms
  hotkey?: string;    // single letter — fired as Ctrl+Alt+<letter> (⌃⌥ on Mac)
};

export const COMMANDS: Command[] = [
  // Create — the entities with a dedicated "New" page. Each has a direct
  // Ctrl+Alt+<letter> combo (⌃⌥ on Mac); letters are mnemonic.
  { id: "new-quotation", label: "New quotation", href: "/quotations/new", group: "Create", perm: P.sales.quotationCreate, keywords: "quote add create", hotkey: "q" },
  { id: "new-invoice", label: "New invoice", href: "/invoices/new", group: "Create", perm: P.invoice.create, keywords: "bill add create", hotkey: "i" },
  { id: "new-product", label: "New product", href: "/products/new", group: "Create", perm: P.inventory.productCreate, keywords: "item sku add create", hotkey: "p" },
  { id: "new-customer", label: "New customer", href: "/customers/new", group: "Create", perm: P.sales.customerCreate, keywords: "client add create", hotkey: "c" },
  { id: "new-vendor", label: "New vendor", href: "/vendors/new", group: "Create", perm: P.procurement.vendorCreate, keywords: "supplier add create", hotkey: "v" },
  { id: "new-po", label: "New purchase order", href: "/purchase-orders/new", group: "Create", perm: P.procurement.poCreate, keywords: "po buy purchase add create", hotkey: "o" },

  // Go to — jump to the main list/dashboard pages.
  { id: "go-dashboard", label: "Dashboard", href: "/", group: "Go to", keywords: "home" },
  { id: "go-quotations", label: "Quotations", href: "/quotations", group: "Go to", perm: P.sales.quotationView },
  { id: "go-orders", label: "Sales Orders", href: "/sales-orders", group: "Go to", perm: P.sales.orderView },
  { id: "go-deliveries", label: "Delivery Notes", href: "/delivery-notes", group: "Go to", perm: P.inventory.deliveryView },
  { id: "go-pos", label: "Purchase Orders", href: "/purchase-orders", group: "Go to", perm: P.procurement.poView },
  { id: "go-invoices", label: "Invoices", href: "/invoices", group: "Go to", perm: P.invoice.view },
  { id: "go-payments", label: "Payments", href: "/payments", group: "Go to", perm: P.invoice.paymentView },
  { id: "go-credits", label: "Returns / Credits", href: "/credit-notes", group: "Go to", perm: P.invoice.creditNoteView },
  { id: "go-products", label: "Products", href: "/products", group: "Go to", perm: P.inventory.productView },
  { id: "go-inventory", label: "Inventory", href: "/inventory", group: "Go to", perm: P.inventory.stockView },
  { id: "go-customers", label: "Customers", href: "/customers", group: "Go to", perm: P.sales.customerView },
  { id: "go-vendors", label: "Vendors", href: "/vendors", group: "Go to", perm: P.procurement.vendorView },
  { id: "go-reports", label: "Reports", href: "/reports", group: "Go to", perm: P.invoice.view },
  { id: "go-settings", label: "Settings", href: "/settings", group: "Go to", perm: P.admin.companyEdit },
];

/** Commands the user is allowed to run, given their permission codes. */
export function allowedCommands(permissions: string[]): Command[] {
  const set = new Set(permissions);
  return COMMANDS.filter((c) => !c.perm || set.has(c.perm));
}

/** Human label for a command's direct combo, e.g. "Ctrl+Alt+P" / "⌃⌥P". */
export function hotkeyLabel(letter: string, isMac: boolean): string {
  return (isMac ? "⌃⌥" : "Ctrl+Alt+") + letter.toUpperCase();
}
