"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar({ userEmail, userName }: { userEmail: string; userName: string }) {
  return (
    <header className="h-14 border-b bg-background flex items-center px-6 justify-between">
      <div className="text-sm text-muted-foreground">
        Signed in as <span className="text-foreground font-medium">{userName}</span>
        <span className="mx-2">·</span>
        <span>{userEmail}</span>
      </div>
      <form action="/auth/signout" method="POST">
        <Button type="submit" variant="ghost" size="sm">
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </form>
    </header>
  );
}
