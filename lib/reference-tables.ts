/**
 * Small reference/config tables that admins can manage from
 * Settings → Reference data. Shared by the page and the generic server actions.
 * The `table` values are an allowlist — the actions refuse anything not here.
 */
export type RefField = {
  key: string;
  label: string;
  type: "text" | "number";
  required?: boolean;
};

export type RefConfig = {
  table: "product_category" | "unit_of_measure" | "tax_rate" | "warehouse";
  label: string;
  singular: string;
  autoCode?: boolean; // generate `code` from the first field (name)
  fields: RefField[]; // editable columns (id / code(auto) / created_at excluded)
  perms: { create: string; edit: string; del: string };
};

const PRODUCT_PERMS = {
  create: "inventory.product.create",
  edit: "inventory.product.edit",
  del: "inventory.product.delete",
};
const ADMIN_PERMS = {
  create: "admin.company.edit",
  edit: "admin.company.edit",
  del: "admin.company.edit",
};

export const REF_TABLES: Record<string, RefConfig> = {
  product_category: {
    table: "product_category",
    label: "Product categories",
    singular: "category",
    autoCode: true,
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
    perms: PRODUCT_PERMS,
  },
  unit_of_measure: {
    table: "unit_of_measure",
    label: "Units of measure",
    singular: "unit",
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "category", label: "Category", type: "text" },
    ],
    perms: ADMIN_PERMS,
  },
  tax_rate: {
    table: "tax_rate",
    label: "Tax rates",
    singular: "tax rate",
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "rate", label: "Rate %", type: "number", required: true },
    ],
    perms: ADMIN_PERMS,
  },
  warehouse: {
    table: "warehouse",
    label: "Warehouses",
    singular: "warehouse",
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "address", label: "Address", type: "text" },
    ],
    perms: ADMIN_PERMS,
  },
};

export const REF_ORDER: (keyof typeof REF_TABLES)[] = [
  "product_category",
  "unit_of_measure",
  "tax_rate",
  "warehouse",
];
