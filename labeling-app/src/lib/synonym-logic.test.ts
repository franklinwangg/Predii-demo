import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriority,
  clusterMemberScores,
  completeLinkClusters,
  cosineSimilarity,
  normalizeTerm,
  pairKey,
} from "@/lib/synonym-logic";
import { embedTerms, generateMissingEmbeddings } from "@/lib/embeddings";
import { Prisma, SynonymClusterStatus } from "@/generated/prisma/client";
import { applySynonymMerge } from "@/lib/synonyms";

test("normalizes term identity without altering the source annotation", () => {
  assert.equal(normalizeTerm("  ECCELERATOR—PEDAL  "), "eccelerator pedal");
  assert.equal(normalizeTerm("Check Engine Light"), "check engine light");
  const original = { exactText: "ECCELERATOR—PEDAL", startOffset: 17, endOffset: 33 };
  normalizeTerm(original.exactText);
  assert.deepEqual(original, { exactText: "ECCELERATOR—PEDAL", startOffset: 17, endOffset: 33 });
});

test("calculates cosine similarity and safely rejects invalid vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), 0);
  assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
});

test("groups close automotive synonyms, but complete linkage keeps related components separate", () => {
  const terms = [
    { id: "accelerator", embedding: [1, 0, 0, 0, 0] },
    { id: "gas-pedal", embedding: [0.98, 0.2, 0, 0, 0] },
    { id: "throttle-body", embedding: [0.1, 0.15, 0.98, 0, 0] },
    { id: "check-engine-light", embedding: [0, 1, 0, 0, 0] },
    { id: "malfunction-indicator-lamp", embedding: [0.1, 0.98, 0, 0, 0] },
    { id: "engine", embedding: [0, 0, 0, 1, 0] },
    { id: "engine-block", embedding: [0, 0, 0.2, 0, 0.98] },
  ];
  const clusters = completeLinkClusters(terms, 0.8);
  assert.deepEqual(
    clusters.map((group) => group.terms.map(({ id }) => id)),
    [["accelerator", "gas-pedal"], ["check-engine-light", "malfunction-indicator-lamp"]],
  );
  assert.ok(clusters[0].pairScores.get(pairKey("accelerator", "gas-pedal"))! > 0.8);
  assert.equal(clusters[1].pairScores.get(pairKey("check-engine-light", "malfunction-indicator-lamp"))! > 0.8, true);
  assert.deepEqual([...clusterMemberScores(clusters[0]).keys()].sort(), ["accelerator", "gas-pedal"]);
});

test("does not use transitive similarity to group a weakly connected term", () => {
  const groups = completeLinkClusters([
    { id: "A", embedding: [1, 0, 0] },
    { id: "B", embedding: [0.8, 0.6, 0] },
    { id: "C", embedding: [0, 1, 0] },
  ], 0.5);
  assert.deepEqual(groups.map((group) => group.terms.map(({ id }) => id)), [["A", "B"]]);
});

test("rejected pairs are not proposed again", () => {
  const groups = completeLinkClusters([
    { id: "a", embedding: [1, 0] },
    { id: "b", embedding: [0.99, 0.1] },
  ], 0.9, new Set([pairKey("a", "b")]));
  assert.deepEqual(groups, []);
});

test("priority rewards similarity and complaint coverage with explicit weights", () => {
  const weights = { similarity: 0.45, annotations: 0.25, complaints: 0.2, terms: 0.1 };
  const low = calculatePriority(0.85, 2, 1, 2, weights);
  const high = calculatePriority(0.95, 100, 100, 5, weights);
  assert.ok(high > low);
  assert.throws(() => calculatePriority(0.9, 10, 10, 2, { similarity: 0, annotations: 0, complaints: 0, terms: 0 }));
});

test("requests embeddings once per distinct normalized term and includes its entity type", async () => {
  let requestCount = 0;
  const vectors = await embedTerms([
    { text: "Gas Pedal", entityType: "Automotive Part / System" },
    { text: " gas   pedal ", entityType: "Automotive Part / System" },
  ], async (_input, init) => {
    requestCount += 1;
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    assert.deepEqual(body.input, ["Automotive entity type: Automotive Part / System. Term: Gas Pedal"]);
    return Response.json({ data: [{ index: 0, embedding: [0.25, 0.75] }] });
  });
  assert.equal(requestCount, 1);
  assert.equal(vectors.length, 1);
  assert.equal(vectors[0].normalizedText, "gas pedal");
  assert.deepEqual(vectors[0].embedding, [0.25, 0.75]);
});

test("reuses cached vectors and sends only unique missing terms for embedding", async () => {
  let requests: string[] = [];
  const cached = [
    { text: "gas pedal", entityType: "Part", normalizedText: "gas pedal", embedding: [1, 0] },
    { text: "accelerator", entityType: "Part", normalizedText: "accelerator", embedding: null },
    { text: " accelerator ", entityType: "Part", normalizedText: "accelerator", embedding: null },
  ];
  const vectors = await generateMissingEmbeddings(cached, async (inputs) => {
    requests = inputs.map(({ text }) => text);
    return inputs.map(({ text, entityType }) => ({
      entityType,
      normalizedText: normalizeTerm(text),
      embedding: [0, 1],
    }));
  });
  assert.deepEqual(requests, ["accelerator"]);
  assert.deepEqual(vectors.get("Part\u0000accelerator"), [0, 1]);
  assert.equal(vectors.has("Part\u0000gas pedal"), false);
});

test("retries transient embedding provider failures", async () => {
  let calls = 0;
  const vectors = await embedTerms([{ text: "engine", entityType: "Part" }], async () => {
    calls += 1;
    if (calls === 1) return new Response("temporarily unavailable", { status: 503 });
    return Response.json({ data: [{ index: 0, embedding: [1, 0] }] });
  });
  assert.equal(calls, 2);
  assert.deepEqual(vectors[0].embedding, [1, 0]);
});

test("merge creates aliases and links annotations without changing original spans", async () => {
  const annotations: Array<{
    id: string;
    termId: string;
    exactText: string;
    startOffset: number;
    endOffset: number;
    entityId: string | null;
  }> = [
    { id: "annotation-1", termId: "term-1", exactText: "gas pedal", startOffset: 4, endOffset: 13, entityId: null },
    { id: "annotation-2", termId: "term-2", exactText: "accelerator", startOffset: 20, endOffset: 31, entityId: null },
  ];
  const originalSpans = annotations.map(({ exactText, startOffset, endOffset }) => ({
    exactText, startOffset, endOffset,
  }));
  const createdAliases: Array<{ entityId: string; termId: string }> = [];
  let createdEntity: { id: string; labelId: string; canonicalName: string; description: string | null } | null = null;
  const transaction = {
    synonymCluster: {
      findUnique: async () => ({
        id: "cluster-1",
        labelId: "part-label",
        status: SynonymClusterStatus.PENDING,
        members: [{ termId: "term-1" }, { termId: "term-2" }],
      }),
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: { data: { status: SynonymClusterStatus; reviewer: string; resolvedEntityId: string } }) => {
        return {
          id: "cluster-1",
          status: data.status,
          reviewer: data.reviewer,
          resolvedEntityId: data.resolvedEntityId,
        };
      },
    },
    automotiveEntity: {
      findUnique: async () => null,
      create: async ({ data }: { data: { labelId: string; canonicalName: string; description: string | null } }) => {
        createdEntity = { id: "entity-1", ...data };
        return createdEntity;
      },
    },
    entityAlias: {
      findMany: async () => [],
      createMany: async ({ data }: { data: Array<{ entityId: string; termId: string }> }) => {
        createdAliases.push(...data);
        return { count: data.length };
      },
    },
    annotation: {
      updateMany: async ({ where, data }: { where: { termId: { in: string[] } }; data: { entityId: string } }) => {
        for (const annotation of annotations) {
          if (where.termId.in.includes(annotation.termId)) annotation.entityId = data.entityId;
        }
        return { count: annotations.length };
      },
    },
    reviewDecision: { create: async () => ({}) },
  } as unknown as Prisma.TransactionClient;

  const result = await applySynonymMerge(transaction, {
    clusterId: "cluster-1",
    canonicalName: "Accelerator pedal",
    reviewer: "test-reviewer",
  });

  assert.equal(result.entity.canonicalName, "Accelerator pedal");
  assert.deepEqual(createdAliases, [
    { entityId: "entity-1", termId: "term-1" },
    { entityId: "entity-1", termId: "term-2" },
  ]);
  assert.ok(annotations.every(({ entityId }) => entityId === "entity-1"));
  assert.deepEqual(
    annotations.map(({ exactText, startOffset, endOffset }) => ({ exactText, startOffset, endOffset })),
    originalSpans,
  );
  assert.equal(result.cluster.status, SynonymClusterStatus.APPROVED);
  assert.equal(result.cluster.reviewer, "test-reviewer");
});
