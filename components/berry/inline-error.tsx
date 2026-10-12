import { ShieldAlert } from "lucide-react"

export function InlineError({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-3 flex w-full items-start gap-2 rounded-[10px] bg-bad-tint px-3 py-2 text-sm text-bad">
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {text}
    </p>
  )
}
