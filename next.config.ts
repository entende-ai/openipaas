import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Without this, Next walks up looking for a lockfile and can pick one outside
  // the project, which nests the standalone output under the full path and
  // breaks `node .next/standalone/server.js`.
  outputFileTracingRoot: path.join(import.meta.dirname, './'),
  // ioredis reaches for Node built-ins (dns, net, tls), so it must be required
  // natively instead of bundled. Only server code imports it.
  serverExternalPackages: ['ioredis'],
  allowedDevOrigins: ["phrasing-sports-eggshell.ngrok-free.dev"]
};

export default nextConfig;
