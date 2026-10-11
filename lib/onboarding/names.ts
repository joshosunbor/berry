/** Name normalisation and fuzzy matching for simulated screening. */

export function normalizeName(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|mx)\.?\s/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean)
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * Similarity 0–1: share of tokens (from the longer name) that match a token
 * in the other name exactly or within 2 edits (for tokens of 5+ letters).
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = normalizeName(a)
  const tb = normalizeName(b)
  if (!ta.length || !tb.length) return 0
  const [long, short] = ta.length >= tb.length ? [ta, tb] : [tb, ta]
  const used = new Set<number>()
  let matched = 0
  for (const t of long) {
    const i = short.findIndex((s, k) => !used.has(k) && (s === t || (Math.min(s.length, t.length) >= 5 && levenshtein(s, t) <= 2)))
    if (i !== -1) {
      used.add(i)
      matched++
    }
  }
  return Math.round((matched / long.length) * 100) / 100
}
