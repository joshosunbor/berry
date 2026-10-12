import localFont from "next/font/local"

/*
 * Geist and Geist Mono, from the geist package's font files. Same settings
 * as the package's own exports, except Geist Mono isn't preloaded: it only
 * styles small labels, so it shouldn't compete with the body font on first
 * load.
 */

export const GeistSans = localFont({
  src: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
})

export const GeistMono = localFont({
  src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  weight: "100 900",
  preload: false,
})
