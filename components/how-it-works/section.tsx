/** A titled section of the How it works page, with an anchor that survives the sticky header. */
export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-line pt-10">
      <h2 id={`${id}-h`} className="text-[clamp(26px,3vw,34px)] font-bold leading-[1.1] tracking-[-0.025em]">
        {title}
      </h2>
      <div className="mt-5 space-y-4 leading-7 text-fg-2">{children}</div>
    </section>
  )
}

export const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })

