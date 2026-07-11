# Invoice UAE — How the System Works

A practical guide to the architecture, data flow, and design decisions behind the
Billing, Sales & Inventory Management System.

> For install/run steps see the root [`README.md`](../README.md).
> For the database specifics see [`db/README.md`](../db/README.md).

---

## 1. What it is

An Odoo-style order-to-cash system covering the full commercial cycle:

```
Quotation ──▶ Sales Order ──▶ Delivery Note ──▶ Invoice ──▶ Payment
  (offer)      (commitment)    (goods issue)     (bill)     (cash)
```

…backed by real-time inventory movement and a granular, three-layer role-based
permission system. Built for a UAE context (AED, 5% VAT) but stack-agnostic in design.

---

## 2. Technology & request lifecycle

| Layer | Choice |
|---|---|
| Frontend & server | **Next.js 15** (App Router, React Server Components) + TypeScript + Tailwind |
| Database / Auth | **Supabase** — Postgres 17, GoTrue auth, PostgREST, Row-Level Security |
| Data access | `@supabase/ssr` (cookie-based sessions), server components + **Server Actions** |
| PDF | `@react-pdf/renderer` (server-side) |
| Charts | Recharts |
| Hosting | Vercel (functions pinned to `sin1`, colocated with the DB) |

**What happens on a request:**

1. **`middleware.ts`** runs on the edge, refreshes the Supabase session cookie, and
   redirects unauthenticated users to `/login`.
2. The matched **server component** (e.g. `app/(app)/invoices/page.tsx`) runs on the
   Vercel function, creates a request-scoped Supabase client bound to the user's JWT,
   and queries the DB. **Row-Level Security** scopes every row to what the user may see.
3. A **`loading.tsx`** skeleton is shown instantly during that fetch (client-side navs).
4. Mutations go through **Server Actions** (`actions.ts` files) which call
   `requirePermission(...)` before writing.

---

## 3. The document flow (the core engine)

Every document is a **linked chain**, and the key design rule is that **partial states
are first-class**: each child document references specific *lines* of its parent, not
just the parent header.

```
sales_order_line
  ├─ quantity_ordered      (what was committed)
  ├─ quantity_delivered    ← rolled up from delivery_note_line
  └─ quantity_invoiced     ← rolled up from invoice_line
```

- A **Delivery Note** can ship *part* of a Sales Order; the SO line's
  `quantity_delivered` is kept in sync by a DB trigger.
- An **Invoice** can bill *part* of what's been delivered; `quantity_invoiced` rolls up
  the same way.
- A single **Payment** can be split across *many* invoices (and one invoice can receive
  *many* payments) through the `payment_allocation` junction table.

Header status (e.g. `partially_delivered`, `partially_paid`) is **derived** from these
line rollups — never stored as the source of truth. This is what stops the classic
"all-or-nothing document" trap.

**Where side effects happen:**

| Event | Trigger | Effect |
|---|---|---|
| Confirm quotation | `confirmQuotation()` action | Creates a Sales Order + copies lines |
| Post delivery note | sets `delivery_note.posted_at` | DB trigger writes append-only `stock_move` rows → stock deducted |
| Create invoice | `createInvoiceFromSO()` action | Bills delivered-but-not-invoiced lines |
| Record payment | `recordPayment()` action | Inserts `payment` + `payment_allocation`; invoice status recomputed |

---

## 4. Data model (essentials)

```
customer ─┐
          ├─< quotation ──< quotation_line
product ──┤        │
tax_rate ─┤        ▼ (confirm)
uom ──────┘   sales_order ──< sales_order_line ──┬──< delivery_note_line >── delivery_note
                                                 └──< invoice_line >──────── invoice
                                                                               │
                                                                     payment_allocation
                                                                               │
                                                                            payment
stock_move  (append-only ledger; on-hand is the stock_on_hand view)
```

- **Master data:** `company`, `tax_rate`, `document_sequence`, `product`,
  `product_category`, `unit_of_measure`, `customer`, `vendor`, `warehouse`, `location`.
- **Numbering:** `document_sequence` + the `next_document_number()` function produce
  `INV-2026-00001`-style codes, resettable yearly.
- Full table list and migration order are in [`db/README.md`](../db/README.md).

---

## 5. Access control (RBAC) — three independent layers

| Layer | Question | Where it lives |
|---|---|---|
| **1 · Module / Action** | *Can this user create a quotation?* | `lib/rbac/can.ts` → `requirePermission()`; DB `my_permission_codes()` RPC |
| **2 · Data scope** | *Which rows — all / own / team / branch?* | Postgres **RLS policies** (migration `0007`) using `scope_allows()` |
| **3 · Field-level** | *Can they see the cost price?* | `lib/rbac/field-filter.ts` strips columns per `field_permission` |

- **Permissions** are granular codes like `sales.quotation.create`, `invoice.void`,
  `inventory.product.view_cost` — see `lib/rbac/permissions.ts`.
- **Roles** bundle permissions. Six ship by default: Administrator, Sales Manager,
  Sales Person, Warehouse Staff, Accountant, Viewer.
- A user can hold **multiple roles**; `user_permission_override` grants/revokes a single
  permission for a single user without inventing a new role.
- **Defense in depth:** the app checks `can(...)` for clean 403s *and* RLS refuses to
  leak rows if the app ever forgets. Never rely on one alone.

**Approvals are a separate layer** (`lib/workflows/approvals.ts`): e.g. *"a quotation
with >15% discount needs Sales Manager sign-off before it becomes a Sales Order."*
Kept out of the permission checks so both stay simple.

---

## 6. Inventory — append-only ledger

`stock_move` rows are **never updated or deleted**; corrections are new offsetting rows.
Current stock is the `stock_on_hand` view (sum of destination minus source per
product/location). This makes the audit trail trivial and lets you answer
*"what did stock look like on July 3?"* truthfully. Posting a Delivery Note is what emits
the stock-out moves (warehouse location → virtual customer location).

---

## 7. Dashboard & reporting

The dashboard (`app/(app)/page.tsx`) renders from small **RLS-scoped aggregate RPCs**
(one round trip each) rather than pulling raw rows:

- `dashboard_totals()` — revenue collected & outstanding
- `revenue_by_month(6)` — invoiced vs collected trend (area chart)
- `invoice_status_counts()` — status distribution (donut)
- `top_customers(5)` — ranking (bar)

Charts are Recharts client components in `components/charts/`.

---

## 8. Performance design

The app is latency-sensitive (server ↔ DB round trips), so:

- **Region colocation:** `vercel.json` pins functions to `sin1` (Singapore), next to the
  Supabase DB — turns ~230 ms cross-region hops into ~5 ms.
- **Fewer round trips:** RBAC resolves in a single `my_permission_codes()` RPC;
  `getCurrentUser()` is React-`cache()`d so the auth check runs once per render; the
  layout fetches permissions + profile in parallel.
- **Instant feedback:** every route has a `loading.tsx` skeleton.
- **In-memory computation:** invoice creation resolves tax rates once and computes lines
  in memory (single insert) instead of an N-per-line update loop.
- **Client render cost:** the quotation form memoizes its option lists so typing doesn't
  rebuild thousands of `<option>` elements.

---

## 9. Security notes

- **RLS on every table** (migration `0007`); helper functions use `SECURITY DEFINER`
  with a pinned `search_path` (migration `0009`) and are not exposed to `anon`.
- **Config resilience:** `lib/db/config.ts` sanitizes the Supabase URL/key from the
  environment and falls back to the known-good *public* anon key if a hosting-dashboard
  paste corrupts it. (The anon key is public by design — RLS is what protects data.)
- **Secrets:** the `service_role` key is only ever read server-side and is never required
  by the deployed app.

---

## 10. Deployment

- **Database:** run `db/migrations/0001 … 0011` in order (or paste `db/schema.sql` once)
  into the Supabase SQL Editor.
- **Vercel env vars:** only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are strictly required (both public). `NEXT_PUBLIC_*`
  vars are inlined at build time — **redeploy** after changing them.
- **Region:** ensure the function region is Singapore (`vercel.json` handles it; also in
  Project Settings → Functions).

---

## 11. Directory map

```
app/
  (app)/                 Authenticated app (layout = sidebar + topbar)
    page.tsx             Dashboard (charts)
    loading.tsx          Per-route skeletons live beside each page
    customers/ products/ quotations/ sales-orders/
    delivery-notes/ invoices/ payments/ settings/
  login/                 Public login (spinner + remember-me)
  auth/signout/          POST sign-out route
components/
  ui/                    shadcn-style primitives (Button, Card, Table, Skeleton…)
  shell/                 Sidebar, MobileNav (drawer), Topbar, nav-config
  charts/                Recharts dashboard charts
  skeletons.tsx          Composable loading skeletons
lib/
  db/                    Supabase clients, config.ts (resilient keys), current-user
  rbac/                  can(), permissions catalog, field-filter
  workflows/             Approval rule engine
  pdf/                   react-pdf document template
  pricing.ts             Line & document total math
db/
  migrations/            0001…0011, applied in order
  schema.sql             All migrations concatenated (one-shot install)
middleware.ts            Session refresh + route gating
vercel.json              Function region pin (sin1)
```

---

## 12. Extending it

- **New permission:** add to `app_permission` (migration `0008`) → `lib/rbac/permissions.ts`
  → grant to roles → use `P.module.perm` in code.
- **New module (e.g. Purchase / GRN / Vendor Bill):** the `vendor` table and schema
  already exist; mirror the sales-flow pages and actions.
- **New report:** add a `SECURITY INVOKER` aggregate RPC (so RLS applies) and a chart.
- **Deferred by design:** multi-currency FX, multi-warehouse transfers, manufacturing/BOM,
  customer portal, barcode hardware, serial/lot tracking.
