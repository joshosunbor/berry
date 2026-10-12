import { cn } from "@/lib/utils"

/* Form fields: 8px radius, a 1px line, the panel colour; a visible label always. */
export const fieldClass = "min-h-10 rounded-[8px] border border-line-strong bg-panel px-3 text-sm text-fg"

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, "pr-8", className)} {...props} />
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "w-full", className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "w-full py-2", className)} {...props} />
}

export function FieldLabel({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm font-medium text-fg", className)} {...props}>
      {children}
    </label>
  )
}
