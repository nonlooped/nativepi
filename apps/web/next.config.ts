import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next's development client must also initialize through this machine's LAN URL.
  // Allow only addresses assigned to the host, never arbitrary external origins.
  allowedDevOrigins: Object.values(networkInterfaces()).flatMap(entries =>
    (entries ?? []).filter(entry => entry.family === "IPv4").map(entry => entry.address),
  ),
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
