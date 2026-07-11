// Mostly a server component; the mobile hamburger and sign-out are client islands.
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";

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
    <header className="h-14 shrink-0 border-b bg-background flex items-center px-3 sm:px-6 justify-between gap-2">
      <div className="flex items-center gap-1 min-w-0">
        <MobileNav permissions={permissions} />
        <div className="text-sm text-muted-foreground truncate">
          <span className="hidden sm:inline">Signed in as </span>
          <span className="text-foreground font-medium">{userName}</span>
          <span className="mx-2 hidden lg:inline">·</span>
          <span className="hidden lg:inline">{userEmail}</span>
        </div>
      </div>
      <SignOutButton />
    </header>
  );
}
