import { cn } from "@/lib/utils"

/* Tab looks, usable from server and client components. */

export type TabsVariant = "underline" | "segmented"

export function tabListClass(variant: TabsVariant) {
  return variant === "segmented" ? "inline-flex flex-wrap rounded-[10px] bg-panel p-1 shadow-inset-line" : "border-t-2 border-fg"
}

export function tabClass(variant: TabsVariant, selected: boolean) {
  return variant === "segmented"
    ? cn("min-h-10 cursor-pointer rounded-[7px] px-4 text-[15px] font-semibold", selected ? "bg-navy text-white" : "bg-transparent text-fg-2 hover:text-fg")
    : cn("-mt-0.5 flex cursor-pointer flex-col justify-start border-t-[3px] bg-transparent pb-4 pl-0 pr-3.5 pt-3.5 text-left", selected ? "border-green text-fg" : "border-transparent text-fg-2")
}
