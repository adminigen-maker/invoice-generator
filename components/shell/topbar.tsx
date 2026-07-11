// Mostly a server component; the mobile hamburger inside is its own client island.
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";

export function Topbar({
  userEmail,
  userName,
  permissions,
}: {
  userEmail: string;
  userName: string;
  permissions: string[];
}) {
  return (
    <header className="h-14 border-b bg-background flex items-center px-3 sm:px-6 justify-between gap-2">
      <div className="flex items-center gap-1 min-w-0">
        <MobileNav permissions={permissions} />
        <div className="text-sm text-muted-foreground truncate">
          <span className="hidden sm:inline">Signed in as </span>
          <span className="text-foreground font-medium">{userName}</span>
          <span className="mx-2 hidden lg:inline">·</span>
          <span className="hidden lg:inline">{userEmail}</span>
        </div>
      </div>
      <form action="/auth/signout" method="POST">
        <Button type="submit" variant="ghost" size="sm">
          <LogOut className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </form>
    </header>
  );
}
