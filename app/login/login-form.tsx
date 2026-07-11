"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/db/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REMEMBER_KEY = "invoice-uae:remember-email";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  // Prefill the email if the user opted into "remember me" last time.
  // Only the email is stored locally — never the password (the browser's
  // password manager handles that securely via the autoComplete fields).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* localStorage unavailable (private mode) — ignore */
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore */
    }

    // Keep the button spinning through the redirect so it never flashes back
    // to "Sign in" while navigation is in flight.
    router.replace(search.get("next") ?? "/");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={loading}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          checked={remember}
          disabled={loading}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Remember my email on this device
      </label>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
