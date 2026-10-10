import { ModeChip } from "@/components/berry/mode-chip";
import { OutcomeChip, type Outcome } from "@/components/berry/outcome-chip";
import { Money } from "@/components/berry/money";
import { MODES, MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";

// Temporary token preview. Replaced by the landing page on Day 2.

const OUTCOMES: Outcome[] = ["approve", "approve_with_conditions", "refer", "decline"];

const TYPE_SCALE = [
  ["display", "text-display font-semibold"],
  ["4xl", "text-4xl font-semibold"],
  ["3xl", "text-3xl font-semibold"],
  ["2xl", "text-2xl font-semibold"],
  ["xl", "text-xl font-medium"],
  ["lg", "text-lg"],
  ["base", "text-base"],
  ["sm", "text-sm"],
  ["xs", "text-xs"],
] as const;

const AMOUNTS = [6_000_000, 800_000, 1_011_250, 12_999];

export default function Home() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8">
      <p className="text-sm font-medium text-muted-ink">Berry · design tokens</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-display">
        One applicant. Three lenders. Three different answers.
      </h1>

      <section aria-labelledby="modes" className="mt-16">
        <h2 id="modes" className="text-xl font-semibold">Modes</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {MODES.map((mode) => {
            const meta = MODE_META[mode];
            return (
              <div key={mode} className={cn("rounded-lg border-t-4 bg-surface p-6 shadow-soft", meta.classes.border)}>
                <ModeChip mode={mode} />
                <p className="mt-4 text-lg font-semibold">{meta.sector}</p>
                <p className="mt-1 text-sm text-muted-ink">{meta.style}</p>
                <div className="mt-6 flex gap-2">
                  <span className={cn("rounded-md px-3 py-2 text-sm font-medium", meta.classes.solid, meta.classes.on)}>
                    Solid
                  </span>
                  <span className={cn("rounded-md px-3 py-2 text-sm font-medium", meta.classes.soft, meta.classes.fg)}>
                    Soft
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="outcomes" className="mt-16">
        <h2 id="outcomes" className="text-xl font-semibold">Outcomes</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {OUTCOMES.map((o) => (
            <OutcomeChip key={o} outcome={o} />
          ))}
        </div>
      </section>

      <section aria-labelledby="type" className="mt-16">
        <h2 id="type" className="text-xl font-semibold">Type scale</h2>
        <div className="mt-6 divide-y divide-rule">
          {TYPE_SCALE.map(([name, cls]) => (
            <div key={name} className="flex items-baseline gap-6 py-3">
              <span className="w-16 shrink-0 font-mono text-xs text-muted-ink">{name}</span>
              <span className={cn("truncate", cls)}>Seasonal operating line</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="numbers" className="mt-16">
        <h2 id="numbers" className="text-xl font-semibold">Tabular numbers</h2>
        <div className="bg-ledger mt-6 max-w-sm rounded-lg border border-rule bg-surface p-6">
          {AMOUNTS.map((c) => (
            <div key={c} className="flex h-8 items-center justify-end">
              <Money cents={c} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
