/**
 * API_ORIGIN (server-side env var, set on the Vercel frontend project):
 * the deployed backend's URL, e.g. https://nisms-backend.vercel.app
 * When set, the frontend proxies /api/* to it — same-origin requests,
 * no CORS, no NEXT_PUBLIC_ build-time baking to get wrong.
 */
const apiOrigin = process.env.API_ORIGIN?.replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
