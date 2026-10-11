export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-8 text-sm text-muted-ink sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Fictional institutions. Synthetic data. A portfolio project by Joshua Osunbor.</p>
        <nav aria-label="Author" className="flex gap-4">
          <a href="https://www.linkedin.com/in/joshuaosunbor" className="underline-offset-4 hover:text-ink hover:underline" rel="noopener noreferrer" target="_blank">
            LinkedIn<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href="https://github.com/joshosunbor/berry" className="underline-offset-4 hover:text-ink hover:underline" rel="noopener noreferrer" target="_blank">
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      </div>
    </footer>
  )
}
