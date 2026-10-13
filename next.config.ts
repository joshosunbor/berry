import type { NextConfig } from "next";

/**
 * Content Security Policy. Everything is served from this origin; the theme
 * script and Next's hydration data are inline, so scripts need
 * 'unsafe-inline' (a nonce would force every page to render dynamically).
 * Development also needs eval for fast refresh.
 */
export function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy(process.env.NODE_ENV !== "production") },
];

/**
 * Old URLs from before the four-section structure, kept working for links
 * already shared. Permanent (308). The browser carries any #fragment across,
 * so /methodology#regulatory-status lands on that tab of How it works.
 */
/** Cast businesses renamed to clearly invented names: old slug → new slug. */
export const RENAMED_SLUGS: Record<string, string> = {
  "corner-grind-cafe": "quillbean-cafe",
  "main-street-hardware": "fennick-hardware",
  "bright-smile-dental": "halverly-dental",
  "lakeside-lodge": "larchmere-lodge",
  "northline-auto-repair": "corvane-auto-repair",
}

/** Every address an old slug could appear in, straight to its new home in one hop. Listed before the general redirects so they win. */
const RENAMED_REDIRECTS = Object.entries(RENAMED_SLUGS).flatMap(([from, to]) => [
  { source: `/applications/${from}`, destination: `/applications/${to}` },
  { source: `/workbench/${from}`, destination: `/applications/${to}` },
  { source: `/compare/${from}`, destination: `/applications/${to}?tab=compare` },
  { source: `/loans/loan_${from}-:lender`, destination: `/loans/loan_${to}-:lender` },
  { source: `/ops/loans/loan_${from}-:lender`, destination: `/loans/loan_${to}-:lender` },
])

export const LEGACY_REDIRECTS = [
  ...RENAMED_REDIRECTS,
  { source: "/workbench", destination: "/applications" },
  { source: "/workbench/:id", destination: "/applications/:id" },
  { source: "/compare/:id", destination: "/applications/:id?tab=compare" },
  { source: "/apply", destination: "/borrower/apply" },
  { source: "/consents", destination: "/borrower/consents" },
  { source: "/ops", destination: "/operations" },
  { source: "/ops/dashboard", destination: "/operations/dashboard" },
  { source: "/ops/loans", destination: "/loans" },
  { source: "/ops/loans/:id", destination: "/loans/:id" },
  { source: "/methodology", destination: "/how-it-works" },
  { source: "/accuracy", destination: "/how-it-works?tab=test-results" },
] as const

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (Fly.io).
  output: "standalone",
  poweredByHeader: false,
  // The link-preview images read Geist from disk when rendered; ship those files with the standalone server.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,SemiBold,Bold}.ttf"],
    "/twitter-image": ["./node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,SemiBold,Bold}.ttf"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: true }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
