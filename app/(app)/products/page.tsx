import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { maskFields } from "@/lib/rbac/field-filter";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = await createClient();
  const perms = await getPermissions();

  const { data: rows } = await supabase
    .from("product")
    .select("id, sku, name, sale_price, cost_price, is_active, uom:unit_of_measure(code), category:product_category(name)")
    .order("name")
    .limit(200);

  const masked = (await maskFields("product", rows ?? [])) as typeof rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Catalog of items available on sales & purchase docs</p>
        </div>
        {perms.has(P.inventory.productCreate) && (
          <Button asChild>
            <Link href="/products/new"><Plus className="h-4 w-4 mr-2" />New product</Link>
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>UoM</TableHead>
              <TableHead className="text-right">Sale price</TableHead>
              {perms.has(P.inventory.productViewCost) && (
                <TableHead className="text-right">Cost price</TableHead>
              )}
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(masked ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No products yet. {perms.has(P.inventory.productCreate) && (
                    <Link className="underline" href="/products/new">Create the first one</Link>
                  )}
                </TableCell>
              </TableRow>
            )}
            {(masked ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="font-medium">
                  {perms.has(P.inventory.productEdit) ? (
                    <Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link>
                  ) : p.name}
                </TableCell>
                <TableCell>{(p.category as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{(p.uom as { code?: string } | null)?.code ?? "—"}</TableCell>
                <TableCell className="text-right">{formatMoney(p.sale_price)}</TableCell>
                {perms.has(P.inventory.productViewCost) && (
                  <TableCell className="text-right text-muted-foreground">{formatMoney((p as { cost_price?: number }).cost_price)}</TableCell>
                )}
                <TableCell>
                  {p.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
