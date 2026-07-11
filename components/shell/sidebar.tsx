import Link from "next/link";
import { NavList } from "./nav-config";

/** Desktop sidebar. Hidden on mobile — the drawer (mobile-nav) takes over there. */
export function Sidebar({ permissions }: { permissions: string[] }) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r bg-background flex-col">
      <div className="h-14 flex items-center px-5 border-b">
        <Link href="/" className="font-semibold tracking-tight">
          Invoice <span className="text-muted-foreground">UAE</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <NavList permissions={permissions} />
      </nav>
    </aside>
  );
}
