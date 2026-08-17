export type StructuralParetoInput = Readonly<{
  candidateId: string;
  standardShanten: number;
  liveImprovingKindCount: number;
  liveImprovingTileCount: number;
}>;

export type StructuralParetoRelation = "dominates" | "dominated" | "tied" | "incomparable";

export type StructuralParetoAnnotation = Readonly<{
  sameShantenParetoFrontier: boolean;
  dominatesCandidateIds: readonly string[];
  dominatedByCandidateIds: readonly string[];
  tiedCandidateIds: readonly string[];
  incomparableCandidateIds: readonly string[];
}>;

export const compareStructuralPareto = (
  left: StructuralParetoInput,
  right: StructuralParetoInput,
): StructuralParetoRelation => {
  if (left.standardShanten !== right.standardShanten) return "incomparable";
  const kindDelta = left.liveImprovingKindCount - right.liveImprovingKindCount;
  const tileDelta = left.liveImprovingTileCount - right.liveImprovingTileCount;
  if (kindDelta === 0 && tileDelta === 0) return "tied";
  if (kindDelta >= 0 && tileDelta >= 0) return "dominates";
  if (kindDelta <= 0 && tileDelta <= 0) return "dominated";
  return "incomparable";
};

/** Stable read-only annotations; input order never changes relation-list ordering. */
export const annotateStructuralPareto = (
  candidates: readonly StructuralParetoInput[],
): ReadonlyMap<string, StructuralParetoAnnotation> => {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.candidateId)) throw new Error("DUPLICATE_PARETO_CANDIDATE_ID");
    ids.add(candidate.candidateId);
  }

  return new Map(
    candidates.map((candidate) => {
      const relations = candidates
        .filter(({ candidateId }) => candidateId !== candidate.candidateId)
        .map((other) => ({
          candidateId: other.candidateId,
          relation: compareStructuralPareto(candidate, other),
        }))
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
      const idsFor = (relation: StructuralParetoRelation): string[] =>
        relations
          .filter((candidateRelation) => candidateRelation.relation === relation)
          .map(({ candidateId }) => candidateId);
      const dominatedByCandidateIds = idsFor("dominated");
      return [
        candidate.candidateId,
        {
          sameShantenParetoFrontier: dominatedByCandidateIds.length === 0,
          dominatesCandidateIds: idsFor("dominates"),
          dominatedByCandidateIds,
          tiedCandidateIds: idsFor("tied"),
          incomparableCandidateIds: idsFor("incomparable"),
        },
      ];
    }),
  );
};
