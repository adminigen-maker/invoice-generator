import Link from "next/link";
import { SidebarContent } from "./nav-config";

/** Desktop sidebar. Pinned full-height; only its nav list scrolls. Hidden on
 *  mobile — the drawer (mobile-nav) takes over there. */
export function Sidebar({ permissions }: { permissions: string[] }) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r bg-background flex-col h-full">
      <div className="h-14 flex items-center px-5 border-b shrink-0">
        <Link href="/" className="font-semibold tracking-tight">
          Invoice <span className="text-muted-foreground">UAE</span>
        </Link>
      </div>
      <SidebarContent permissions={permissions} />
    </aside>
  );
}
