export type EmbeddedTerm = {
  id: string;
  embedding: number[];
};

export type CandidateGroup = {
  terms: EmbeddedTerm[];
  pairScores: Map<string, number>;
};

export function normalizeTerm(text: string): string {
  const normalized = text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized) return normalized;
  const codePoints = Array.from(text.normalize("NFKC").toLocaleLowerCase("en-US"))
    .map((character) => character.codePointAt(0)!.toString(16));
  return codePoints.length > 0 ? `symbol ${codePoints.join(" ")}` : "";
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function completeLinkClusters(
  terms: EmbeddedTerm[],
  threshold: number,
  rejectedPairs: Set<string> = new Set(),
): CandidateGroup[] {
  const sorted = [...terms].sort((left, right) => left.id.localeCompare(right.id));
  const groups: CandidateGroup[] = [];

  for (const term of sorted) {
    const eligible = groups
      .map((group) => ({
        group,
        scores: group.terms.map((member) => cosineSimilarity(term.embedding, member.embedding)),
      }))
      .filter(({ group, scores }) =>
        scores.every((score, index) =>
          score >= threshold &&
          !rejectedPairs.has(pairKey(term.id, group.terms[index].id)),
        ),
      )
      .sort((left, right) =>
        Math.min(...right.scores) - Math.min(...left.scores) ||
        left.group.terms[0].id.localeCompare(right.group.terms[0].id),
      );

    if (eligible.length === 0) {
      groups.push({ terms: [term], pairScores: new Map() });
      continue;
    }

    const chosen = eligible[0].group;
    for (const member of chosen.terms) {
      chosen.pairScores.set(pairKey(term.id, member.id), cosineSimilarity(term.embedding, member.embedding));
    }
    chosen.terms.push(term);
  }

  return groups.filter((group) => group.terms.length > 1);
}

export function pairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`;
}

export function clusterMemberScores(group: CandidateGroup): Map<string, number> {
  const scores = new Map<string, number>();
  for (const term of group.terms) {
    const neighbors = group.terms.filter((other) => other.id !== term.id);
    scores.set(
      term.id,
      neighbors.length === 0
        ? 1
        : Math.min(...neighbors.map((other) => group.pairScores.get(pairKey(term.id, other.id)) ?? 0)),
    );
  }
  return scores;
}

export function calculatePriority(
  similarity: number,
  annotationCount: number,
  complaintCount: number,
  termCount: number,
  weights: { similarity: number; annotations: number; complaints: number; terms: number },
): number {
  const totalWeight = weights.similarity + weights.annotations + weights.complaints + weights.terms;
  if (totalWeight <= 0) throw new Error("Synonym priority weights must have a positive sum.");
  const normalized = {
    similarity: Math.max(0, Math.min(1, similarity)),
    annotations: Math.min(1, Math.log1p(annotationCount) / Math.log1p(100)),
    complaints: Math.min(1, Math.log1p(complaintCount) / Math.log1p(100)),
    terms: Math.min(1, Math.log1p(termCount) / Math.log1p(10)),
  };
  return (
    (normalized.similarity * weights.similarity +
      normalized.annotations * weights.annotations +
      normalized.complaints * weights.complaints +
      normalized.terms * weights.terms) /
    totalWeight
  );
}
