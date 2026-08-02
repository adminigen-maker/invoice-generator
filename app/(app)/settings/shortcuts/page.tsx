import { getPermissions } from "@/lib/rbac/can";
import { Card, CardContent } from "@/components/ui/card";
import { ShortcutsReference } from "@/components/shortcuts-reference";

export const metadata = { title: "Keyboard shortcuts" };

export default async function ShortcutsSettingsPage() {
  const perms = await getPermissions();
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Keyboard shortcuts</h1>
        <p className="text-sm text-muted-foreground">
          Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px]">Ctrl/⌘ + K</kbd> anywhere to open the
          command menu, or <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px]">?</kbd> for this list.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ShortcutsReference permissions={Array.from(perms)} />
        </CardContent>
      </Card>
    </div>
  );
}
