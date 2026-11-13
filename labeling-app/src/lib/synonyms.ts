import { createHash } from "node:crypto";
import { Prisma, SynonymClusterStatus } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { getPrismaClient } from "@/lib/prisma";
import { embeddingCacheKey, embeddingModelName, embedTerms, generateMissingEmbeddings } from "@/lib/embeddings";
import type { CachedEmbeddingInput } from "@/lib/embeddings";
import {
  calculatePriority,
  clusterMemberScores,
  completeLinkClusters,
  cosineSimilarity,
  normalizeTerm,
  pairKey,
} from "@/lib/synonym-logic";
import type { CandidateGroup } from "@/lib/synonym-logic";

const LEGACY_BACKFILL_LIMIT = 1_000;
const EMBEDDING_BATCH_TERM_LIMIT = 1_000;

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED";
type TermStats = { annotationCount: number; complaintCount: number; complaintIds: string[] };

function configuredThreshold(): number {
  const threshold = Number(process.env.SYNONYM_SIMILARITY_THRESHOLD ?? "0.82");
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new Error("SYNONYM_SIMILARITY_THRESHOLD must be a number between -1 and 1.");
  }
  return threshold;
}

function priorityWeights() {
  const weights = {
    similarity: Number(process.env.SYNONYM_PRIORITY_SIMILARITY_WEIGHT ?? "0.45"),
    annotations: Number(process.env.SYNONYM_PRIORITY_ANNOTATIONS_WEIGHT ?? "0.25"),
    complaints: Number(process.env.SYNONYM_PRIORITY_COMPLAINTS_WEIGHT ?? "0.2"),
    terms: Number(process.env.SYNONYM_PRIORITY_TERMS_WEIGHT ?? "0.1"),
  };
  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Synonym priority weights must be non-negative numbers.");
  }
  if (weights.similarity + weights.annotations + weights.complaints <= 0) {
    throw new Error("At least one synonym priority weight must be positive.");
  }
  return weights;
}

function readEmbedding(value: Prisma.JsonValue | null): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.filter((item): item is number => typeof item === "number");
  return values.length === value.length && values.every(Number.isFinite) ? values : null;
}

function currentEmbedding(term: { embedding: Prisma.JsonValue | null; embeddingModel: string | null }) {
  return term.embeddingModel === embeddingCacheKey() ? readEmbedding(term.embedding) : null;
}

function clusterKey(labelId: string, termIds: string[]): string {
  const digest = createHash("sha256").update([...termIds].sort().join("\u0000")).digest("hex");
  return `${labelId}:${digest}`;
}

async function backfillLegacyAnnotations(prisma: ReturnType<typeof getPrismaClient>) {
  const unlinked = await prisma.annotation.findMany({
    where: { termId: null },
    select: { id: true, labelId: true, exactText: true },
    orderBy: { id: "asc" },
    take: LEGACY_BACKFILL_LIMIT,
  });
  if (unlinked.length === 0) return 0;

  await prisma.$transaction(async (transaction) => {
    for (const annotation of unlinked) {
      const normalizedText = normalizeTerm(annotation.exactText);
      if (!normalizedText) continue;
      const term = await transaction.synonymTerm.upsert({
        where: { labelId_normalizedText: { labelId: annotation.labelId, normalizedText } },
        create: {
          labelId: annotation.labelId,
          text: annotation.exactText,
          normalizedText,
        },
        update: {},
        select: { id: true, alias: { select: { entityId: true } } },
      });
      await transaction.annotation.update({
        where: { id: annotation.id },
        data: { termId: term.id, entityId: term.alias?.entityId ?? null },
      });
    }
  });
  return unlinked.length;
}

export async function discoverSynonymClusters() {
  const prisma = getPrismaClient();
  const threshold = configuredThreshold();
  const weights = priorityWeights();
  const backfilledAnnotations = await backfillLegacyAnnotations(prisma);
  const terms = await prisma.synonymTerm.findMany({
    where: { annotations: { some: {} } },
    include: {
      label: { select: { name: true } },
      alias: { select: { entityId: true, entity: { select: { id: true, canonicalName: true } } } },
    },
    orderBy: [{ labelId: "asc" }, { normalizedText: "asc" }],
  });

  const missingTerms = terms.filter(
    (term) => term.embeddingModel !== embeddingCacheKey() || !readEmbedding(term.embedding),
  );
  const toEmbed = missingTerms.slice(0, EMBEDDING_BATCH_TERM_LIMIT);
  const cached: CachedEmbeddingInput[] = toEmbed.map((term) => ({
    text: term.text,
    entityType: term.label.name,
    normalizedText: term.normalizedText,
    embedding: null,
  }));
  let generated: Map<string, number[]>;
  try {
    generated = await generateMissingEmbeddings(cached, embedTerms);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The embedding provider returned an unknown error.";
    throw new HttpError(`Embedding generation failed: ${detail}`, 503);
  }
  for (const term of toEmbed) {
    const vector = generated.get(`${term.label.name}\u0000${term.normalizedText}`);
    if (vector) {
      await prisma.synonymTerm.update({
        where: { id: term.id },
        data: {
          embedding: vector,
          embeddingModel: embeddingCacheKey(),
        },
      });
      term.embedding = vector;
      term.embeddingModel = embeddingCacheKey();
    }
  }

  const termsByLabel = new Map<string, typeof terms>();
  for (const term of terms) {
    const group = termsByLabel.get(term.labelId) ?? [];
    group.push(term);
    termsByLabel.set(term.labelId, group);
  }
  const thresholdMatches = terms.length === 0
    ? []
    : await prisma.rejectedSynonymPair.findMany({
        where: {
          OR: [
            { termAId: { in: terms.map(({ id }) => id) } },
            { termBId: { in: terms.map(({ id }) => id) } },
          ],
        },
        select: { termAId: true, termBId: true },
      });
  const rejectedPairs = new Set(thresholdMatches.map(({ termAId, termBId }) => pairKey(termAId, termBId)));
  const termStats = await loadTermStats(prisma, terms.map(({ id }) => id));
  const existingClusters = await prisma.synonymCluster.findMany({
    where: { labelId: { in: [...termsByLabel.keys()] } },
    include: { members: { select: { termId: true } } },
  });
  const existingKeys = new Set(
    existingClusters.map((cluster) =>
      clusterKey(cluster.labelId, cluster.members.map(({ termId }) => termId)),
    ),
  );
  const activeTermIds = new Set(
    existingClusters
      .filter((cluster) =>
        cluster.status === SynonymClusterStatus.PENDING ||
        cluster.status === SynonymClusterStatus.DEFERRED,
      )
      .flatMap((cluster) => cluster.members.map(({ termId }) => termId)),
  );
  let created = 0;
  const unlinkedAnnotationCount = await prisma.annotation.count({ where: { termId: null } });

  for (const [labelId, labelTerms] of termsByLabel) {
    const vectors = labelTerms.flatMap((term) => {
      const embedding = currentEmbedding(term);
      return embedding ? [{ id: term.id, embedding }] : [];
    });
    const unresolved = labelTerms.filter((term) => !term.alias);
    const unresolvedIds = new Set(unresolved.map(({ id }) => id));
    const candidateGroups = completeLinkClusters(
      vectors.filter(({ id }) => unresolvedIds.has(id)),
      threshold,
      rejectedPairs,
    );
    const resolved = labelTerms.flatMap((term) => {
      const embedding = currentEmbedding(term);
      return term.alias && embedding
        ? [{ term, embedding, entity: term.alias.entity }]
        : [];
    });
    const groups: Array<{ group: CandidateGroup; suggestedEntityId: string | null; scores: Map<string, number> }> = [];
    for (const group of candidateGroups) {
      const suggested = findSuggestedEntity(group, resolved, threshold, rejectedPairs);
      groups.push({
        group,
        suggestedEntityId: suggested.entityId,
        scores: clusterMemberScores(group),
      });
    }
    for (const term of unresolved) {
      if (candidateGroups.some((group) => group.terms.some((member) => member.id === term.id))) continue;
      const embedding = currentEmbedding(term);
      if (!embedding) continue;
      const singleton = findSuggestedEntity(
        { terms: [{ id: term.id, embedding }], pairScores: new Map() },
        resolved,
        threshold,
        rejectedPairs,
      );
      if (!singleton.entityId) continue;
      groups.push({
        group: { terms: [{ id: term.id, embedding }], pairScores: new Map() },
        suggestedEntityId: singleton.entityId,
        scores: new Map([[term.id, singleton.score]]),
      });
    }

    for (const candidate of groups) {
      const memberIds = candidate.group.terms.map(({ id }) => id);
      const key = clusterKey(labelId, memberIds);
      if (existingKeys.has(key) || memberIds.some((termId) => activeTermIds.has(termId))) continue;
      const scoreValues = [...candidate.scores.values()];
      const similarity = scoreValues.length
        ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
        : 0;
      const annotationCount = memberIds.reduce(
        (sum, id) => sum + (termStats.get(id)?.annotationCount ?? 0),
        0,
      );
      const complaintIds = new Set(
        memberIds.flatMap((id) => termStats.get(id)?.complaintIds ?? []),
      );
      const complaintCount = complaintIds.size;
      const members = candidate.group.terms.map((member) => ({
        termId: member.id,
        similarityScore: candidate.scores.get(member.id) ?? 0,
      }));
      await prisma.synonymCluster.upsert({
        where: { pendingKey: key },
        create: {
          labelId,
          pendingKey: key,
          priorityScore: calculatePriority(similarity, annotationCount, complaintCount, memberIds.length, weights),
          suggestedEntityId: candidate.suggestedEntityId,
          members: { create: members },
        },
        update: {
          priorityScore: calculatePriority(similarity, annotationCount, complaintCount, memberIds.length, weights),
          suggestedEntityId: candidate.suggestedEntityId,
        },
      });
      existingKeys.add(key);
      for (const termId of memberIds) activeTermIds.add(termId);
      created += 1;
    }
  }

  return {
    created,
    backfilledAnnotations,
    embeddedTerms: toEmbed.length,
    examinedTerms: terms.length,
    threshold,
    priorityWeights: weights,
    embeddingModel: embeddingModelName(),
    hasMoreTerms: missingTerms.length > toEmbed.length || unlinkedAnnotationCount > 0,
  };
}

function findSuggestedEntity(
  group: CandidateGroup,
  resolved: Array<{ term: { id: string }; embedding: number[]; entity: { id: string; canonicalName: string } }>,
  threshold: number,
  rejectedPairs: Set<string>,
): { entityId: string | null; score: number } {
  const entityScores = new Map<string, number[]>();
  for (const member of group.terms) {
    const matches = resolved
      .filter(({ term }) => !rejectedPairs.has(pairKey(member.id, term.id)))
      .map(({ embedding, entity }) => ({
        entityId: entity.id,
        score: cosineSimilarity(member.embedding, embedding),
      }))
      .filter(({ score }) => score >= threshold);
    const bestPerEntity = new Map<string, number>();
    for (const match of matches) {
      bestPerEntity.set(match.entityId, Math.max(bestPerEntity.get(match.entityId) ?? -1, match.score));
    }
    for (const [entityId, score] of bestPerEntity) {
      const scores = entityScores.get(entityId) ?? [];
      scores.push(score);
      entityScores.set(entityId, scores);
    }
  }
  const best = [...entityScores.entries()]
    .map(([entityId, scores]) => ({
      entityId,
      score: scores.reduce((sum, value) => sum + value, 0) / scores.length,
      coverage: scores.length,
    }))
    .sort((left, right) =>
      right.coverage - left.coverage || right.score - left.score || left.entityId.localeCompare(right.entityId),
    )[0];
  return best ? { entityId: best.entityId, score: best.score } : { entityId: null, score: 0 };
}

async function loadTermStats(prisma: ReturnType<typeof getPrismaClient>, termIds: string[]) {
  if (termIds.length === 0) return new Map<string, TermStats>();
  const rows = await prisma.$queryRaw<
    Array<{ termId: string; annotationCount: number; complaintCount: number; complaintIds: string[] }>
  >`
    SELECT a."termId", COUNT(*)::int AS "annotationCount",
      COUNT(DISTINCT a."documentId")::int AS "complaintCount",
      ARRAY_AGG(DISTINCT a."documentId") AS "complaintIds"
    FROM "Annotation" a
    WHERE a."termId" IN (${Prisma.join(termIds)})
    GROUP BY a."termId"
  `;
  return new Map(rows.map((row) => [row.termId, row]));
}

export async function listSynonymClusters(options: {
  status: ReviewStatus;
  page: number;
  limit: number;
  labelId?: string;
}) {
  const prisma = getPrismaClient();
  const where = {
    status: options.status as SynonymClusterStatus,
    ...(options.labelId ? { labelId: options.labelId } : {}),
  };
  const [clusters, total] = await prisma.$transaction([
    prisma.synonymCluster.findMany({
      where,
      orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      include: {
        label: { select: { id: true, name: true } },
        suggestedEntity: { select: { id: true, canonicalName: true } },
        resolvedEntity: { select: { id: true, canonicalName: true } },
        members: {
          orderBy: { term: { text: "asc" } },
          include: {
            term: {
              include: {
                alias: { include: { entity: { select: { id: true, canonicalName: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.synonymCluster.count({ where }),
  ]);
  const stats = await loadTermStats(
    prisma,
    clusters.flatMap((cluster) => cluster.members.map(({ termId }) => termId)),
  );
  return {
    clusters: clusters.map((cluster) => ({
      ...cluster,
      members: cluster.members.map((member) => ({
        ...member,
        annotationCount: stats.get(member.termId)?.annotationCount ?? 0,
        complaintCount: stats.get(member.termId)?.complaintCount ?? 0,
      })),
    })),
    total,
    page: options.page,
    limit: options.limit,
  };
}

export async function getSynonymCluster(clusterId: string) {
  const prisma = getPrismaClient();
  const cluster = await prisma.synonymCluster.findUnique({
    where: { id: clusterId },
    include: {
      label: { select: { id: true, name: true } },
      suggestedEntity: { select: { id: true, canonicalName: true } },
      resolvedEntity: { select: { id: true, canonicalName: true } },
      members: {
        include: {
          term: {
            include: { alias: { include: { entity: { select: { id: true, canonicalName: true } } } } },
          },
        },
      },
    },
  });
  if (!cluster) throw new HttpError("Synonym cluster not found.", 404);
  const stats = await loadTermStats(prisma, cluster.members.map(({ termId }) => termId));
  return {
    ...cluster,
    members: cluster.members.map((member) => ({
      ...member,
      annotationCount: stats.get(member.termId)?.annotationCount ?? 0,
      complaintCount: stats.get(member.termId)?.complaintCount ?? 0,
    })),
  };
}

export async function mergeSynonymCluster(input: {
  clusterId: string;
  canonicalName: string;
  entityId?: string;
  description?: string;
  reviewer: string;
}) {
  const prisma = getPrismaClient();
  return prisma.$transaction((transaction) => applySynonymMerge(transaction, input));
}

export async function applySynonymMerge(
  transaction: Prisma.TransactionClient,
  input: {
    clusterId: string;
    canonicalName: string;
    entityId?: string;
    description?: string;
    reviewer: string;
  },
) {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new HttpError("A canonical name is required.", 400);
  const cluster = await transaction.synonymCluster.findUnique({
    where: { id: input.clusterId },
    include: { members: { select: { termId: true } } },
  });
  if (!cluster) throw new HttpError("Synonym cluster not found.", 404);
  if (cluster.status !== SynonymClusterStatus.PENDING && cluster.status !== SynonymClusterStatus.DEFERRED) {
    throw new HttpError("Only pending or deferred clusters can be merged.", 409);
  }
  const claimed = await transaction.synonymCluster.updateMany({
    where: { id: cluster.id, status: { in: [SynonymClusterStatus.PENDING, SynonymClusterStatus.DEFERRED] } },
    data: { status: SynonymClusterStatus.APPROVED },
  });
  if (!claimed.count) throw new HttpError("This cluster was already reviewed.", 409);
  let entity = input.entityId
    ? await transaction.automotiveEntity.findFirst({
        where: { id: input.entityId, labelId: cluster.labelId },
      })
    : await transaction.automotiveEntity.findUnique({
        where: { labelId_canonicalName: { labelId: cluster.labelId, canonicalName } },
      });
  if (input.entityId && !entity) {
    throw new HttpError("The selected canonical entity is not in this entity type.", 400);
  }
  if (entity && entity.canonicalName !== canonicalName) {
    throw new HttpError("The canonical name must match the selected existing entity.", 400);
  }
  if (!entity) {
    entity = await transaction.automotiveEntity.create({
      data: {
        labelId: cluster.labelId,
        canonicalName,
        description: input.description?.trim() || null,
      },
    });
  }
  const termIds = cluster.members.map(({ termId }) => termId);
  const aliases = await transaction.entityAlias.findMany({
    where: { termId: { in: termIds } },
    select: { termId: true, entityId: true },
  });
  const conflict = aliases.find((alias) => alias.entityId !== entity.id);
  if (conflict) {
    throw new HttpError(
      "A cluster term is already assigned to another canonical entity. Resolve that entity first.",
      409,
    );
  }
  await transaction.entityAlias.createMany({
    data: termIds
      .filter((termId) => !aliases.some((alias) => alias.termId === termId))
      .map((termId) => ({ entityId: entity.id, termId })),
  });
  await transaction.annotation.updateMany({
    where: { termId: { in: termIds }, status: "ACCEPTED" },
    data: { entityId: entity.id },
  });
  const approved = await transaction.synonymCluster.update({
    where: { id: cluster.id },
    data: {
      status: SynonymClusterStatus.APPROVED,
      pendingKey: null,
      reviewer: input.reviewer,
      decisionNote: input.description?.trim() || null,
      resolvedEntityId: entity.id,
    },
  });
  await transaction.reviewDecision.create({
    data: {
      clusterId: cluster.id,
      reviewer: input.reviewer,
      action: "MERGE",
      details: { entityId: entity.id, canonicalName, termIds, note: input.description ?? null },
    },
  });
  return { cluster: approved, entity };
}

export async function rejectSynonymCluster(input: {
  clusterId: string;
  reviewer: string;
  note?: string;
}) {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (transaction) => {
    const cluster = await transaction.synonymCluster.findUnique({
      where: { id: input.clusterId },
      include: { members: { select: { termId: true } } },
    });
    if (!cluster) throw new HttpError("Synonym cluster not found.", 404);
    if (cluster.status !== SynonymClusterStatus.PENDING && cluster.status !== SynonymClusterStatus.DEFERRED) {
      throw new HttpError("Only pending or deferred clusters can be rejected.", 409);
    }
    const claimed = await transaction.synonymCluster.updateMany({
      where: { id: cluster.id, status: { in: [SynonymClusterStatus.PENDING, SynonymClusterStatus.DEFERRED] } },
      data: { status: SynonymClusterStatus.REJECTED },
    });
    if (!claimed.count) throw new HttpError("This cluster was already reviewed.", 409);
    const pairs = [];
    for (let left = 0; left < cluster.members.length; left += 1) {
      for (let right = left + 1; right < cluster.members.length; right += 1) {
        const [termAId, termBId] = [cluster.members[left].termId, cluster.members[right].termId].sort();
        pairs.push({ termAId, termBId });
      }
    }
    if (pairs.length > 0) {
      await transaction.rejectedSynonymPair.createMany({ data: pairs, skipDuplicates: true });
    }
    const updated = await transaction.synonymCluster.update({
      where: { id: cluster.id },
      data: {
        status: SynonymClusterStatus.REJECTED,
        pendingKey: null,
        reviewer: input.reviewer,
        decisionNote: input.note?.trim() || null,
      },
    });
    await transaction.reviewDecision.create({
      data: { clusterId: cluster.id, reviewer: input.reviewer, action: "REJECT", details: { note: input.note ?? null } },
    });
    return updated;
  });
}

export async function moveSynonymTerms(input: {
  clusterId: string;
  targetClusterId: string;
  termIds: string[];
  reviewer: string;
}) {
  if (input.clusterId === input.targetClusterId) throw new HttpError("Choose a different target cluster.", 400);
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.synonymCluster.findUnique({ where: { id: input.clusterId }, include: { members: true } }),
      tx.synonymCluster.findUnique({ where: { id: input.targetClusterId }, include: { members: true } }),
    ]);
    if (!source || !target) throw new HttpError("Cluster not found.", 404);
    if (source.labelId !== target.labelId) throw new HttpError("Clusters must have the same category.", 400);
    if (![source.status, target.status].every((status) => status === "PENDING" || status === "DEFERRED")) {
      throw new HttpError("Only pending or deferred clusters can be edited.", 409);
    }
    const ids = [...new Set(input.termIds)];
    if (!ids.length || ids.some((id) => !source.members.some((member) => member.termId === id))) {
      throw new HttpError("Select terms belonging to the source cluster.", 400);
    }
    if (ids.length >= source.members.length) throw new HttpError("At least one term must remain in the source cluster.", 400);
    await tx.synonymClusterMember.deleteMany({ where: { clusterId: source.id, termId: { in: ids } } });
    await tx.synonymClusterMember.createMany({
      data: ids.map((termId) => ({ clusterId: target.id, termId, similarityScore: 0 })),
    });
    await tx.synonymCluster.updateMany({
      where: { id: { in: [source.id, target.id] } },
      data: { pendingKey: null, llmStatus: "needs_review", llmExplanation: "Membership changed by a human reviewer." },
    });
    await tx.reviewDecision.create({
      data: { clusterId: source.id, reviewer: input.reviewer, action: "MOVE_TERMS", details: { termIds: ids, targetClusterId: target.id } },
    });
    return { moved: ids.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deferSynonymCluster(input: {
  clusterId: string;
  reviewer: string;
  note?: string;
}) {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (transaction) => {
    const result = await transaction.synonymCluster.updateMany({
      where: {
        id: input.clusterId,
        status: { in: [SynonymClusterStatus.PENDING, SynonymClusterStatus.DEFERRED] },
      },
      data: {
        status: SynonymClusterStatus.DEFERRED,
        pendingKey: null,
        reviewer: input.reviewer,
        decisionNote: input.note?.trim() || null,
      },
    });
    if (result.count === 0) {
      const exists = await transaction.synonymCluster.findUnique({
        where: { id: input.clusterId },
        select: { id: true },
      });
      if (!exists) throw new HttpError("Synonym cluster not found.", 404);
      throw new HttpError("Only pending or deferred clusters can be deferred.", 409);
    }
    await transaction.reviewDecision.create({
      data: { clusterId: input.clusterId, reviewer: input.reviewer, action: "DEFER", details: { note: input.note ?? null } },
    });
    return transaction.synonymCluster.findUniqueOrThrow({ where: { id: input.clusterId } });
  });
}

export async function listCanonicalEntities(options: {
  labelId?: string;
  query?: string;
  page: number;
  limit: number;
}) {
  const prisma = getPrismaClient();
  const where = {
    ...(options.labelId ? { labelId: options.labelId } : {}),
    ...(options.query ? { canonicalName: { contains: options.query, mode: "insensitive" as const } } : {}),
  };
  const [entities, total] = await prisma.$transaction([
    prisma.automotiveEntity.findMany({
      where,
      orderBy: [{ canonicalName: "asc" }, { id: "asc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      include: { label: { select: { id: true, name: true } }, _count: { select: { terms: true, annotations: true } } },
    }),
    prisma.automotiveEntity.count({ where }),
  ]);
  return { entities, total, page: options.page, limit: options.limit };
}

export async function getCanonicalEntity(entityId: string) {
  const prisma = getPrismaClient();
  const entity = await prisma.automotiveEntity.findUnique({
    where: { id: entityId },
    include: {
      label: { select: { id: true, name: true } },
      terms: {
        orderBy: { term: { text: "asc" } },
        include: { term: { include: { _count: { select: { annotations: true } } } } },
      },
      _count: { select: { annotations: true } },
    },
  });
  if (!entity) throw new HttpError("Canonical entity not found.", 404);
  return entity;
}

export async function createCanonicalEntity(input: {
  canonicalName: string;
  labelId: string;
  description?: string;
}) {
  const prisma = getPrismaClient();
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new HttpError("A canonical name is required.", 400);
  const label = await prisma.label.findUnique({ where: { id: input.labelId }, select: { id: true } });
  if (!label) throw new HttpError("Entity type not found.", 404);
  return prisma.automotiveEntity.create({
    data: { canonicalName, labelId: input.labelId, description: input.description?.trim() || null },
  });
}

export async function createTermForAnnotation(
  transaction: Prisma.TransactionClient,
  labelId: string,
  exactText: string,
) {
  const normalizedText = normalizeTerm(exactText);
  if (!normalizedText) return null;
  return transaction.synonymTerm.upsert({
    where: { labelId_normalizedText: { labelId, normalizedText } },
    create: { labelId, text: exactText, normalizedText },
    update: {},
    select: { id: true, alias: { select: { entityId: true } } },
  });
}
