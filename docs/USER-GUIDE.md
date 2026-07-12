# Invoice UAE — User Guide

A step‑by‑step walkthrough of how to use the system, from signing in to getting
paid. It follows the natural business flow:

> **Quotation → Sales Order → Delivery Note → Invoice → Payment**, on top of your
> **Products** and **Customers** master data, all controlled by **Roles & Permissions**.

---

## 1. Sign in

1. Open the app URL (e.g. `https://invoice-generator-sand-five.vercel.app`).
2. Enter your **email** and **password**. Tick **Remember my email** to prefill it next time.
3. You land on the **Dashboard**.

> Accounts are created by an administrator (see [§8 Admin](#8-admin)). There is no public sign‑up.

---

## 2. Find your way around

- **Top bar** — who you're signed in as, and **Sign out**.
- **Sidebar** — your menu. Collapse it with the toggle (top‑left) to a slim **icon rail**; the icons stay visible.
- **Areas** — the menu is grouped into three areas. Switch with the **Change area** button at the bottom of the sidebar:
  - **Operations** — Dashboard, Quotations, Sales Orders, Delivery Notes, Invoices, Payments
  - **Master Data** — Products, Customers
  - **Admin** — Roles & Users, Settings, Usage & Limits

You only see menu items and buttons your **role** allows.

**Every list** has the same tools:
- A **search box** (by number / name / code).
- **Active / Inactive / All** view tabs.
- An **Actions** column with per‑row buttons (see [§6](#6-editing-cancelling-and-deleting-rows)).

---

## 3. Set up master data first

Before creating documents, add the things you sell and the people you sell to.

### Products (Master Data → Products)
1. Click **New product**.
2. Fill in **SKU**, **Name**, **Unit of measure**, **Sale price** (and optionally category, cost price, tax, reorder point).
3. **Save** — you return to the list and see it immediately.

> Tip: You don't have to leave a form to add a missing item — most dropdowns have a **“+ New…”** quick‑add button.

### Customers (Master Data → Customers)
1. Click **New customer**.
2. Enter **Name** (the **code** auto‑generates), and optionally **TRN**, credit limit, payment terms, default tax.
3. **Save**.

---

## 4. The core flow — quote to cash

### Step 1 · Quotation (Operations → Quotations)
1. **New quotation** → pick the **customer** and dates.
2. Add **line items**: choose a product (or type a description), **quantity**, **unit price**, **discount %**, **tax**. Totals (subtotal, VAT, total) calculate automatically.
3. **Save** as a draft. Edit any time while it's *Draft* or *Sent*.
4. When the customer agrees, open it and **Confirm** → this creates a **Sales Order** automatically and moves the quote to *Confirmed*.

### Step 2 · Sales Order (Operations → Sales Orders)
The confirmed commitment. From here you can create the delivery and the bill.
- Create a **Delivery Note** to ship goods, and/or an **Invoice** to bill.

### Step 3 · Delivery Note (Operations → Delivery Notes) — *optional*
Delivery notes are optional in this setup (stock is issued by the invoice — see
Step 4). Use them only if you want a separate goods‑issue document.
> ⚠️ Posting a delivery note **also** deducts stock. To avoid deducting twice,
> **don't post a delivery note for goods you're already issuing via the invoice.**

### Step 4 · Invoice (Operations → Invoices)
1. Created from a Sales Order (or standalone).
2. **Post** the invoice → it becomes a final, locked tax invoice (status *Invoiced*)
   **and deducts stock** for each stockable line (on‑hand drops). This is the stock
   issue point in the invoice‑only workflow.
3. **Print / PDF** → produces the UAE tax‑invoice PDF (company details, TRN, 5% VAT, bank details).

### Step 5 · Payment (Operations → Payments)
1. Open the invoice and **Record payment** — enter amount, date, method, reference.
2. The invoice **balance** and **status** update automatically:
   - part paid → *Partially paid*
   - fully paid → *Paid*
3. Payments appear in **Payments**, allocated against their invoices.

**The dashboard** reflects all of this: revenue over time, invoice status breakdown, top customers, and outstanding balances.

---

## 5. Search & filter any list

- **Search** — type in the box; results filter as you type (document number, customer, SKU, TRN, etc.).
- **Views** — **Active** hides cancelled/closed documents (and inactive master records); **Inactive** shows only those; **All** shows everything.

---

## 6. Editing, cancelling and deleting rows

Each row's **Actions** column has buttons appropriate to that record. A button is
**greyed out with a tooltip** when it isn't allowed for the current status.

| Record | Deactivate / Cancel | Delete |
|---|---|---|
| **Products, Customers** | Deactivate / Activate (on‑off) | Delete (blocked if used elsewhere) |
| **Quotations, Sales Orders** | Cancel (early stages) | Delete — blocked if it has newer linked documents |
| **Invoices** | Cancel (drafts only) | Delete drafts only; **posted invoices can't be deleted** |
| **Delivery Notes** | — | Delete drafts only; **posted notes can't be deleted** |
| **Payments** | — | Delete (restores the invoice balance) |

Rules of thumb:
- **Deactivate/Cancel** keeps the record but takes it out of the active list.
- **Delete** removes it permanently — and is **automatically blocked** if the record is linked to other documents or has already affected stock/finances. You'll get a clear message telling you what to remove first.

---

## 7. Printing PDFs

On an **Invoice** or **Quotation**, use **Print / PDF** to generate the formatted
UAE document (letterhead, TRN, itemised lines, 5% VAT, totals, and bank details).
Save or print it for the customer.

---

## 8. Admin

Visible under the **Admin** area to users with admin rights.

### Roles & Users (Admin → Roles & Users)
- **Add user** — create a login account: email, name, a temporary password (auto‑generated; share it with them), and an optional starting **role** and **data scope**. *(Requires the server‑side service key — see the deploy notes if you get a “not configured” message.)*
- **Add role** — create a custom role, then grant it capabilities in the permission matrix below.
- **Assign roles** — click a role chip next to a user to grant/remove it.
- **Data scope** — per user: **All records**, **Team**, **Branch**, or **Own only** — controls which records that user can see and act on.
- **Permission matrix** — tick/untick each capability (view, create, edit, delete, post, void…) per role, per module.

### Settings (Admin → Settings)
- **Company** — name, legal name, **TRN**, address, phone/WhatsApp, email, **bank account**, logo — these appear on every printed document.
- **Document sequences** — the numbering for quotations, orders, invoices, etc.

### Usage & Limits (Admin → Usage & Limits)
Live cards showing your **database size**, **file storage**, and **auth users**
against the Supabase **Free‑tier** limits, plus a largest‑tables breakdown and a
limits reference.

---

## 9. Good to know

- **Idle / left open** — list pages auto‑refresh every 30 seconds and when you return to the tab, so data stays current. Long‑running edit forms are not interrupted.
- **The database never sleeps** — the project is on Supabase's Free tier, which pauses a project after ~7 days of no activity. A daily automated ping keeps it awake, so the app is always ready.
- **You only see what you're allowed to** — menus, buttons and data are all filtered by your role and data scope. If something is missing, an admin can grant it in **Roles & Users**.

---

### Quick reference — the happy path

```
Add Product + Customer
        │
        ▼
New Quotation ──Confirm──▶ Sales Order
                               │
                 ┌─────────────┴─────────────┐
                 ▼                            ▼
          Delivery Note                    Invoice
          (Post = stock out)          (Post = final bill)
                                            │
                                            ▼
                                    Record Payment ──▶ Paid
```
