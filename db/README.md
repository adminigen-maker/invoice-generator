# Database

Migrations are numbered and must be applied in order:

| # | File | What it does |
|---|---|---|
| 0001 | `extensions_and_types.sql` | Postgres extensions and shared enums (doc_status, tracking_type, …) |
| 0002 | `rbac.sql` | Users, roles, permissions, overrides, field-level rules, audit log |
| 0003 | `master_data.sql` | Company, tax, sequences, categories, UoM, products, customers, vendors, warehouses |
| 0004 | `sales_flow.sql` | Quotation → Sales Order → Delivery Note, with parent-line links |
| 0005 | `invoicing_and_payments.sql` | Invoice, credit note, payment, allocation + rollup triggers |
| 0006 | `inventory.sql` | Append-only stock_move + on-hand view + post-delivery hook |
| 0007 | `rls_policies.sql` | Enables RLS on every user-facing table + baseline policies |
| 0008 | `seed_rbac_and_defaults.sql` | Default roles, permissions, tax, UoM, sequences, warehouse, locations |

## Applying to a Supabase project

Option A — one-shot (fastest):
1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the whole of [`schema.sql`](schema.sql), and Run.
   `schema.sql` is all 8 migrations concatenated in order (regenerate it from
   `migrations/*.sql` if you change a migration). It has been validated end-to-end
   against a real Postgres engine (33 relations, 57 RLS policies, seed data).

Option B — Supabase Dashboard, file by file:
1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run each file in order (0001 → 0008).

Option B — Supabase CLI (recommended for teams):
```bash
supabase link --project-ref <your-ref>
supabase db push
```
Copy the `.sql` files into `supabase/migrations/` first if using the CLI.

## Design notes

- **Partial states are first-class.** `sales_order_line` carries `quantity_ordered`, `quantity_delivered`, `quantity_invoiced`. Header status is derived from line rollups (triggers keep these accurate).
- **Stock moves are append-only.** No updates or deletes. Corrections are new offsetting rows. `stock_on_hand` is a view.
- **RLS is defense-in-depth.** The app enforces permission checks in server actions (`lib/rbac/can.ts`) — RLS just refuses to leak rows if the app forgets. Never rely on RLS alone.
- **Field-level masking is app-side.** Enforced by `lib/rbac/field-filter.ts`. RLS in Postgres can't easily strip specific columns from a row it's returning; the app does that.

## Adding a permission

1. Add it to migration 0008 (`app_permission` insert).
2. Add the code to `lib/rbac/permissions.ts`.
3. Grant it to whichever default roles should have it (also in 0008).
4. Reference it via `P.<module>.<perm>` in server components/actions.
