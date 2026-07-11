# Invoice UAE

Billing, Sales & Inventory Management System — Quotation → Sales Order → Delivery Note → Invoice → Payment, with real-time inventory and three-layer RBAC.

Built on **Next.js 15 + TypeScript + Supabase (Postgres + Auth + RLS) + Tailwind + shadcn/ui**.

---

## What's inside

### Sales & Order-to-Cash
- **Quotations** — multi-line editor, per-line tax/discount, live totals, PDF export
- **Sales Orders** — created from a confirmed quotation, tracks quantity_ordered vs delivered vs invoiced *per line*
- **Delivery Notes** — partial or full delivery from a sales order; posting deducts stock via append-only moves
- **Invoices** — from a sales order or standalone; posting locks the doc; PDF export
- **Payments** — full or partial, allocated across many invoices via a junction table

### Inventory
- Products (SKU, UoM, tax, tracking type, cost/sale price)
- Warehouse with multiple internal locations (stock, damaged, transit, virtual customer/vendor)
- Append-only `stock_move` ledger + `stock_on_hand` view

### RBAC — three independent layers
1. **Module/Action** — 40+ granular permissions (`sales.quotation.create`, `invoice.void`, …) grouped into 6 default roles
2. **Data scope** — Postgres RLS enforces `all` / `own` / `team` / `branch` per user_role
3. **Field-level** — server strips columns like `cost_price` when the role lacks the view perm

Plus a separate **approval engine** (`lib/workflows/approvals.ts`) for rules like "discount > 15% needs Sales Manager sign-off" — kept independent of RBAC so both stay simple.

### Design invariants
- **Partial states are first-class.** Every child document links to specific parent *lines*, not headers. Header status is derived from line rollups.
- **Stock moves are append-only.** Corrections are offsetting rows, not edits.
- **Server actions gate every mutation** via `requirePermission()`. RLS is defense-in-depth.

---

## Setup

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com), create a project (pick a region close to the UAE — e.g. `eu-central-1` or Bahrain if available).

Copy from **Project Settings → API**:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Apply migrations

Open **SQL Editor** in the Supabase dashboard and run each file in `db/migrations/` in order:

```
0001_extensions_and_types.sql
0002_rbac.sql
0003_master_data.sql
0004_sales_flow.sql
0005_invoicing_and_payments.sql
0006_inventory.sql
0007_rls_policies.sql
0008_seed_rbac_and_defaults.sql
```

Or use the Supabase CLI:
```bash
supabase link --project-ref <your-ref>
# copy db/migrations/*.sql into supabase/migrations/ first
supabase db push
```

### 3. Configure the app

```bash
cp .env.example .env.local
# Fill in the Supabase URL + keys
```

### 4. Install & run

```bash
npm install
npm run dev
```

### 5. Create the first admin

Auth needs an admin user; you can't sign yourself up (RLS blocks writing to `app_user`). Bootstrap once:

```bash
node scripts/bootstrap-admin.mjs admin@yourcompany.com "StrongPass!1" "Admin Name"
```

Then sign in at [http://localhost:3000/login](http://localhost:3000/login).

---

## Repository layout

```
app/
  (app)/                   Authenticated app routes
    layout.tsx             Sidebar + topbar shell
    page.tsx               Dashboard
    products/              Master data — products (list/new/[id])
    customers/             Master data — customers
    quotations/            Sales — quotations (list/new/[id] + PDF route)
    sales-orders/          Sales — sales orders + create-delivery / create-invoice
    delivery-notes/        Inventory — delivery notes + post-and-deduct-stock
    invoices/              Finance — invoices + post + record-payment + PDF
    payments/              Finance — payments list
    settings/              Company + Roles matrix
  login/                   Public login form
  auth/signout/            POST endpoint for sign-out
components/
  ui/                      shadcn primitives (Button, Input, Card, Table, …)
  shell/                   Sidebar, Topbar
  status-badge.tsx         Doc_status → colored badge
db/
  migrations/              Numbered SQL files, ordered 0001 → 0008
  README.md                Migration notes and design decisions
lib/
  db/                      supabase-browser, supabase-server, supabase-admin
  rbac/                    can() + permissions catalog + field-filter
  workflows/               Approval rule engine
  pdf/                     react-pdf document template
  pricing.ts               Line & document total calculations
  utils.ts                 cn(), formatMoney, formatDate
middleware.ts              Session refresh + gated routes
scripts/
  bootstrap-admin.mjs      Create the first admin user
```

---

## Default roles (seeded)

| Role | Sees | Can do |
|---|---|---|
| **Administrator** | Everything | Everything, including RBAC config |
| **Sales Manager** | Sales team's docs + view Inventory & AR | Full Sales module, view cost/margin |
| **Sales Person** | Own customers/quotations only | Create quotations & orders. **No cost price visible.** |
| **Warehouse Staff** | Product catalog + stock + deliveries | Post delivery notes, adjust stock, receive goods |
| **Accountant** | Invoices, payments, credit notes | Full Finance module |
| **Viewer** | All view perms | Read-only |

## Adding a new permission

1. Add to `app_permission` in migration 0008.
2. Add constant to `lib/rbac/permissions.ts`.
3. Grant to the roles that need it (also in 0008).
4. Call `requirePermission(P.foo.bar)` in server actions; check with `can(P.foo.bar)` in server components.

---

## What's *not* in this MVP

Deferred per the spec:
- Multi-currency FX conversion (schema supports it, no UI)
- Multi-warehouse transfer requests (single warehouse, multiple internal locations)
- Manufacturing / BOM
- Customer self-service portal
- Barcode scanning hardware integration
- Serial/lot tracking (schema supports it via `product.tracking`)
- Purchase Order → GRN → Vendor Bill (Phase 5)
- Full financial reports (Aging AR, Tax report for VAT filing) — Phase 6

The database schema **already** covers Phases 1–5. Purchase-side UI is straightforward to add against the existing `vendor` table.

## Continuing the build — suggested next steps

1. **Roles admin UI** — the read-only matrix at `/settings/roles` needs edit UI: toggle perms in a matrix, assign roles to users, drop/add overrides.
2. **Purchase module** (Phase 5) — `purchase_order`, `goods_receipt_note`, `vendor_bill` tables (mirror the sales schema), matching UI at `/purchase-orders`, `/goods-receipts`.
3. **Reports** — Sales by product/customer/period, Aging AR (30/60/90), VAT tax report for UAE filing. Use SQL views under `db/migrations/00N_reports.sql`.
4. **Approval workflow persistence** — move `lib/workflows/approvals.ts` rules into an `approval_rule` table with admin UI; record actual approval events.
5. **Arabic RTL** — layout already uses logical props; add `next-intl` + `dir="rtl"` toggle.
6. **Field-permission admin UI** — table exists, needs a screen to manage which fields each role can see.
