import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { getPrismaClient } from "@/lib/prisma";
import { llmConfig, proposeSynonyms } from "@/lib/llm";
import type { LlmTerm } from "@/lib/llm";
import { pairKey } from "@/lib/synonym-logic";
import { createTermForAnnotation } from "@/lib/synonyms";

const BATCH_SIZE = 40;

function representativeContext(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const boundary = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n"));
  const next = after.search(/[.!?\n]/);
  return text.slice(Math.max(boundary + 1, start - 300), next < 0 ? Math.min(text.length, end + 300) : Math.min(end + next + 1, end + 300)).trim();
}

export async function discoverLlmSynonyms() {
  const prisma = getPrismaClient();
  const unlinked = await prisma.annotation.findMany({
    where: { termId: null, status: "ACCEPTED" },
    select: { id: true, exactText: true, labelId: true },
    orderBy: { id: "asc" },
    take: 1000,
  });
  await prisma.$transaction(async (tx) => {
    for (const annotation of unlinked) {
      const term = await createTermForAnnotation(tx, annotation.labelId, annotation.exactText);
      if (term) {
        await tx.annotation.updateMany({
          where: { id: annotation.id, termId: null },
          data: { termId: term.id, entityId: term.alias?.entityId ?? null },
        });
      }
    }
  }, { timeout: 30_000 });

  const terms = await prisma.synonymTerm.findMany({
    where: {
      alias: null,
      annotations: { some: { status: "ACCEPTED" } },
      clusterMembers: { none: { cluster: { status: { in: ["PENDING", "DEFERRED"] } } } },
    },
    orderBy: [{ labelId: "asc" }, { id: "asc" }],
    include: {
      label: { select: { name: true } },
      annotations: {
        where: { status: "ACCEPTED" },
        take: 3,
        orderBy: { createdAt: "desc" },
        select: { startOffset: true, endOffset: true, document: { select: { originalText: true } } },
      },
    },
  });
  const groups = new Map<string, LlmTerm[]>();
  for (const term of terms) {
    const items = groups.get(term.labelId) ?? [];
    items.push({
      id: term.id,
      text: term.text,
      category: term.label.name,
      contexts: term.annotations.map((annotation) =>
        representativeContext(annotation.document.originalText, annotation.startOffset, annotation.endOffset),
      ),
    });
    groups.set(term.labelId, items);
  }
  const model = llmConfig().model;
  for (const [labelId, items] of groups) {
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const batch = items.slice(offset, offset + BATCH_SIZE);
      if (batch.length < 2) continue;
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ version: "synonyms-v1", url: llmConfig().url, model, batch }))
        .digest("hex");
      if (await prisma.synonymDiscoveryRun.findUnique({ where: { fingerprint } })) continue;
      let proposals;
      try {
        proposals = await proposeSynonyms(batch);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown LLM error.";
        throw new HttpError(`Synonym discovery failed: ${detail}`, 503);
      }
      const rejected = await prisma.rejectedSynonymPair.findMany({
        where: { termAId: { in: batch.map((item) => item.id) }, termBId: { in: batch.map((item) => item.id) } },
      });
      const rejectedPairs = new Set(rejected.map((pair) => pairKey(pair.termAId, pair.termBId)));
      let created = 0;
      await prisma.$transaction(async (tx) => {
        for (const proposal of proposals) {
          const ids = [...proposal.aliases].sort();
          if (ids.some((left, index) => ids.slice(index + 1).some((right) => rejectedPairs.has(pairKey(left, right))))) continue;
          const digest = createHash("sha256").update(ids.join("\u0000")).digest("hex");
          const pendingKey = `${labelId}:${digest}`;
          const existing = await tx.synonymCluster.findFirst({
            where: {
              labelId,
              members: { some: { termId: { in: ids } } },
              status: { in: ["PENDING", "DEFERRED"] },
            },
            select: { id: true },
          });
          if (existing) continue;
          const previouslyRejected = await tx.synonymCluster.findFirst({
            where: { labelId, status: "REJECTED", members: { every: { termId: { in: ids } } } },
            include: { members: { select: { termId: true } } },
          });
          if (previouslyRejected && previouslyRejected.members.length === ids.length) continue;
          await tx.synonymCluster.create({
            data: {
              labelId,
              pendingKey,
              llmStatus: proposal.status,
              llmCanonicalName: proposal.canonical_name,
              llmExplanation: proposal.explanation,
              llmModel: model,
              priorityScore: proposal.status === "needs_review" ? 1 : 0.5,
              members: { create: ids.map((termId) => ({ termId, similarityScore: 0 })) },
            },
          });
          created += 1;
        }
        await tx.synonymDiscoveryRun.create({ data: { fingerprint, model } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
      return { created, examinedTerms: batch.length, model, hasMoreTerms: true };
    }
  }
  return { created: 0, examinedTerms: terms.length, model, hasMoreTerms: unlinked.length === 1000 };
}
