const MAX_DISTANCE = 3

const MIN_SIMILARITY = 0.4

/**
 * @see https://en.wikipedia.org/wiki/Damerau–Levenshtein_distance
 * Calculating optimal string alignment distance, no substring is edited more than once.
 * (Simple implementation.)
 */
export function editDistance(a: string, b: string): number {
  // Quick early exit, return worst case.
  if (Math.abs(a.length - b.length) > MAX_DISTANCE) {
    return Math.max(a.length, b.length)
  }

  // distance between prefix substrings of a and b
  const d: number[][] = []

  // pure deletions turn a into empty string
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i]
  }
  // pure insertions turn empty string into b
  for (let j = 0; j <= b.length; j++) {
    d[0] ??= []
    d[0][j] = j
  }

  // fill matrix
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      let cost = 1

      if (a[i - 1] === b[j - 1]) {
        cost = 0
      } else {
        cost = 1
      }

      // TypeScript's index checking is too strict for this algorithm :skull:
      d[i] ??= []
      const di = d[i] ?? []

      di[j] = Math.min(
        (d[i - 1]?.[j] ?? 0) + 1, // deletion
        (d[i]?.[j - 1] ?? 0) + 1, // insertion
        (d[i - 1]?.[j - 1] ?? 0) + cost, // substitution
      )

      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        di[j] = Math.min(di[j] ?? 0, (d[i - 2]?.[j - 2] ?? 0) + 1)
      }
    }
  }

  return d[a.length]?.[b.length] ?? 0
}

/**
 * Find close matches, restricted to same number of edits.
 */
export function generateSuggestion(word: string, candidates?: string[]): string {
  if (!candidates || candidates.length === 0) {
    return ''
  }

  // remove possible duplicates
  candidates = Array.from(new Set(candidates))

  const searchingOptions = word.startsWith('--')

  if (searchingOptions) {
    word = word.slice(2)
    candidates = candidates.map((candidate) => candidate.slice(2))
  }

  let similar: string[] = []

  let bestDistance = MAX_DISTANCE

  candidates.forEach((candidate) => {
    if (candidate.length <= 1) {
      return // no one character guesses
    }

    const distance = editDistance(word, candidate)

    const length = Math.max(word.length, candidate.length)

    const similarity = (length - distance) / length

    if (similarity > MIN_SIMILARITY) {
      if (distance < bestDistance) {
        // better edit distance, throw away previous worse matches
        bestDistance = distance
        similar = [candidate]
      } else if (distance === bestDistance) {
        similar.push(candidate)
      }
    }
  })

  similar.sort((a, b) => a.localeCompare(b))

  if (searchingOptions) {
    similar = similar.map((candidate) => `--${candidate}`)
  }

  if (similar.length > 1) {
    return `\n(Did you mean one of ${similar.join(', ')}?)`
  }

  if (similar.length === 1) {
    return `\n(Did you mean ${similar[0]}?)`
  }

  return ''
}
