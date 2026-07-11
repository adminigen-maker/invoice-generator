"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <LogOut className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Sign out?"
        description="You'll need to sign in again to get back into the workspace."
      >
        {/* Native form POST → the sign-out route handler clears the session. */}
        <form action="/auth/signout" method="POST" onSubmit={() => setLoading(true)} className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign out
          </Button>
        </form>
      </Dialog>
    </>
  );
}
