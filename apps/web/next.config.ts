import type { NextConfig } from 'next';

/** Sent with every response (also on Vercel, where HSTS covers the custom domain too). */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The web app asks for the camera (photos), location (search area, pickup)
  // and payments (Razorpay checkout) on its own pages only.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(self), microphone=(), geolocation=(self), payment=(self "https://api.razorpay.com")',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // @sajha/ui ships TypeScript source.
  transpilePackages: ['@sajha/ui'],
  experimental: {
    // Photos are shrunk in the browser first; this leaves room for a few per form.
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
