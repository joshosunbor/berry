import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import { LENDER_ORDER } from "@/content/landing"
import { landingData } from "@/lib/landing/data"
import { MODE_META } from "@/lib/modes"

/*
 * The link preview (OpenGraph and Twitter): Hollis Family Farm's three
 * answers from the compare view, with every figure taken from the engine at
 * build time, and the fictional-data line.
 */

export const alt = "One applicant, three lenders: Aspen Bank declines, Kite offers a small line, Northgate Credit Union offers a seasonal operating line. Fictional institutions, synthetic data."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const NAVY = "#011b33"
const ACCENT: Record<string, string> = { credit_union: "#14b8a6", fintech: "#8b5cf6", bank: "#64748b" }

/** Geist at 400, 600 and 700, as ArrayBuffers, so headings render in the same weights as the site. The image is prerendered at build time. */
async function geist(weight: 400 | 600 | 700) {
  const file = { 400: "Geist-Regular.ttf", 600: "Geist-SemiBold.ttf", 700: "Geist-Bold.ttf" }[weight]
  const buf = await readFile(path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file))
  return { name: "Geist", data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const }
}

export default async function OpenGraphImage() {
  const d = landingData()
  const fonts = await Promise.all([geist(400), geist(600), geist(700)])
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: NAVY, color: "white", padding: "56px 64px", fontFamily: "Geist, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 700 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: "#3bb75e" }} />
          Berry
        </div>
        <div style={{ marginTop: 28, fontSize: 52, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>One applicant. Three lenders. Three different answers.</div>
        <div style={{ marginTop: 12, fontSize: 24, color: "#b7c4d3" }}>
          {`${d.applicant.name} · ${d.applicant.description}`}
        </div>
        <div style={{ marginTop: 36, display: "flex", gap: 24 }}>
          {LENDER_ORDER.map(({ mode, kind }) => {
            const l = d.lenders[mode]
            return (
              <div key={mode} style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0b2a47", borderRadius: 16, borderTop: `6px solid ${ACCENT[mode]}`, padding: "22px 24px" }}>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{MODE_META[mode].institution}</div>
                <div style={{ fontSize: 18, color: "#9fb0c3" }}>{kind}</div>
                <div style={{ marginTop: 14, fontSize: 44, fontWeight: 700, color: l.approved ? "#7ee2a0" : "#ffb4a8" }}>{l.headline}</div>
                <div style={{ marginTop: 4, fontSize: 20, color: "#d5dee8" }}>{l.product}</div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: "auto", fontSize: 20, color: "#9fb0c3" }}>Fictional institutions. Synthetic data. A portfolio project by Joshua Osunbor.</div>
      </div>
    ),
    { ...size, fonts },
  )
}
