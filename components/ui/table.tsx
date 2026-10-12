import { cn } from "@/lib/utils"

/*
 * Tables (design handoff: a panel-alt header row, 1px line rules, mono
 * figures). Wrap wide tables in Table so they scroll sideways on phones.
 */
export function Table({
  className,
  wrapperClassName,
  minWidth,
  caption,
  label,
  dense = false,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { wrapperClassName?: string; minWidth?: number; caption?: string; label?: string; dense?: boolean }) {
  // A table wider than the screen scrolls sideways; the scroll area is focusable so keyboard users can reach it.
  const scrolls = Boolean(minWidth)
  return (
    <div
      className={cn("min-w-0 overflow-x-auto", wrapperClassName)}
      {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": label ?? (caption ? `${caption} (scrolls sideways)` : "Table (scrolls sideways)") } : {})}
    >
      <table
        className={cn(
          "w-full border-collapse text-left text-sm",
          // Dense: compact cells for tables inside a card.
          dense && "[&_:is(th,td)]:px-3 [&_:is(th,td)]:py-2 [&_:is(th,td):first-child]:pl-0 [&_thead]:bg-transparent [&_thead_th]:text-xs",
          className,
        )}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-panel-alt text-fg-3", className)} {...props} />
}

export function Th({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <th className={cn("border-b border-line px-6 py-3.5 align-top font-medium", numeric && "text-right", className)} {...props} />
}

export function Td({ className, numeric, mono, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; mono?: boolean }) {
  return <td className={cn("border-b border-line-soft px-6 py-[11px] align-top", numeric && "text-right", (mono || numeric) && "font-mono text-[13px]", className)} {...props} />
}
