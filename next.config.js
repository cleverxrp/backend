/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This project is an API-only backend. Pages are not used.
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

module.exports = nextConfig;
