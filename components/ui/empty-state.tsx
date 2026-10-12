import { cn } from "@/lib/utils"

/** Nothing to show yet: a dashed panel with a short title, a line of explanation and an optional action. */
export function EmptyState({ title, children, action, className }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[14px] border border-dashed border-line-strong p-6 text-center", className)}>
      <p className="font-semibold text-fg">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[52ch] text-sm text-fg-2">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
