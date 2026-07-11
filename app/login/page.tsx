import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invoice UAE</CardTitle>
          <CardDescription>
            Sign in to access the billing & inventory workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* LoginForm reads useSearchParams(); Suspense is required so the
              page can be prerendered without bailing out of static export. */}
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
