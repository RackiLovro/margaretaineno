/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow larger photo uploads (25 MB) forwarded to the home storage server.
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};

export default nextConfig;