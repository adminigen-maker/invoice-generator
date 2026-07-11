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
};

export default nextConfig;
