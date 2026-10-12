import { cn } from "@/lib/utils"
import { Pill } from "./pill"

/*
 * Section heading (design handoff H2: clamp(32px, 4vw, 48px), 700, tight
 * leading). Optional small label above, lead paragraph, and an action
 * (usually a link) on the right.
 */
export const h2Class = "text-[clamp(32px,4vw,48px)] font-bold leading-[1.05] tracking-[-0.03em]"
export const h3Class = "text-[22px] font-semibold tracking-[-0.015em]"

export function SectionHeader({
  id,
  label,
  title,
  lead,
  action,
  as: Tag = "h2",
  onNavy = false,
  titleClass,
  className,
}: {
  id?: string
  label?: string
  title: React.ReactNode
  lead?: React.ReactNode
  action?: React.ReactNode
  as?: "h2" | "h3"
  onNavy?: boolean
  titleClass?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-10 gap-y-4", className)}>
      <div className="min-w-0">
        {label && (
          <Pill tone="info" label className="mb-3">
            {label}
          </Pill>
        )}
        <Tag id={id} className={cn(Tag === "h2" ? h2Class : h3Class, onNavy && "text-white", titleClass)}>
          {title}
        </Tag>
        {lead && <div className={cn("mt-3.5 max-w-[56ch]", onNavy ? "text-on-navy" : "text-fg-2")}>{lead}</div>}
      </div>
      {action}
    </div>
  )
}
