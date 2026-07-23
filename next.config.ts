import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the large, partly-native PDF renderer out of the serverless bundle
  // (required from node_modules at runtime) — cuts cold-start on the PDF routes.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    // Tree-shake barrel imports so pages only bundle the icons/utils they use.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-slot",
      "@radix-ui/react-label",
      "@radix-ui/react-separator",
      "date-fns",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
  // Security headers applied to every response. We deliberately keep the CSP to
  // `frame-ancestors` (anti-clickjacking) rather than a full script-src policy —
  // Next.js hydration needs inline bootstrap scripts, so a strict script-src
  // would require nonces and is a separate, larger change. Everything here is
  // safe for the current app (Supabase XHR, Recharts inline styles, PDFs).
  async headers() {
    const securityHeaders = [
      // 'self' / SAMEORIGIN — NOT 'none'/DENY: the PDF preview in <PdfButton>
      // embeds our own /…/pdf routes in a same-origin iframe, and DENY blocks
      // that too. This still stops any external site from framing the app.
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
