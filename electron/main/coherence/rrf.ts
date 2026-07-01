// Reciprocal Rank Fusion: combina varias listas rankeadas en una sola sin
// tunear pesos. Apto cuando los scores no son comparables (BM25 vs cosine).
// Portado de: github.com/rahul-alhan/company-brain-rag/retrieval/hybrid.py
export default function rrfFuse(rankedLists: string[][], rrfK = 60): Array<[string, number]> {
  const fused = new Map<string, number>()
  for (const ids of rankedLists) {
    ids.forEach((id, rank) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (rrfK + rank + 1))
    })
  }
  return [...fused.entries()].sort((a, b) => b[1] - a[1])
}
