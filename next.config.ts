import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  // ioredis reaches for Node built-ins (dns, net, tls), so it must be required
  // natively instead of bundled. Only server code imports it.
  serverExternalPackages: ['ioredis'],
  allowedDevOrigins: ["phrasing-sports-eggshell.ngrok-free.dev"]
};

export default nextConfig;
