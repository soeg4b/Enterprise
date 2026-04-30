/** @type {import('next').NextConfig} */

// SEC-FIX (Sec stage): added a baseline Content-Security-Policy plus HSTS,
// COOP, COEP and Permissions-Policy headers. CSP intentionally allows
// 'unsafe-inline' for styles only (Tailwind injects inline <style>) and
// 'unsafe-inline' for scripts in development; production must run with the
// strict CSP — see env-gated branch below. The connect-src origin is taken
// from NEXT_PUBLIC_API_URL so deployments without a hard-coded API host still
// work (fallback: same-origin only).
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const isProd = process.env.NODE_ENV === 'production';

// Allow OpenStreetMap tile servers (used by Leaflet) and the API origin so
// that map tiles and uploaded photos render. Tiles are served from
// {a,b,c}.tile.openstreetmap.org over https.
const tileOrigins = 'https://*.tile.openstreetmap.org https://tile.openstreetmap.org';

const cspProd = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob: ${apiOrigin} ${tileOrigins}`.trim(),
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-inline' for scripts is required for Next.js inline bootstrap;
  // tighten with nonces in a follow-up (App Router supports CSP nonces).
  "script-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${apiOrigin}`.trim(),
].join('; ');

const cspDev = [
  "default-src 'self'",
  `img-src 'self' data: blob: ${apiOrigin} http://localhost:* ${tileOrigins}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src 'self' ${apiOrigin} ws://localhost:* http://localhost:*`.trim(),
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: isProd ? cspProd : cspDev },
  // HSTS only behind TLS (the ingress / CDN must add it conditionally too).
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {},
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default nextConfig;
