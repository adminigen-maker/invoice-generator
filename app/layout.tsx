import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Invoice UAE",
    template: "%s · Invoice UAE",
  },
  description: "Billing, Sales & Inventory Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
