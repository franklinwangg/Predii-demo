import assert from "node:assert/strict";
import test from "node:test";
import { aggregateEntityExtractions, ENTITY_MODELS, extractModelEntities, proposeSynonyms, restoreModelEntities, validateExtraction, validateSynonymProposals } from "@/lib/llm";
import type { LlmTerm } from "@/lib/llm";
import type { Prisma } from "@/generated/prisma/client";
import { acceptMissingOccurrences, applyEntityReview } from "@/lib/entity-review";
import { ENTITY_CONFIDENCE_THRESHOLD, groupEntityMentions, isConfidentEntity } from "@/lib/entity-confidence";
import { findPhraseOccurrences, groupMentions } from "@/lib/mention-groups";

test("validates structured extraction and preserves exact complaint text and UTF-16 offsets", () => {
  const complaint = "🚗 The gas pedal stuck.";
  const output = {
    entities: [{
      text: "gas pedal", type: "Component", confidence: 7, start_offset: 7, end_offset: 16,
      explanation: "Part may be ambiguous.",
    }],
  };
  const entities = validateExtraction(output, complaint, ["Component", "Symptom"]);
  assert.equal(entities[0].text, "gas pedal");
  assert.equal(entities[0].confidence, 7);
  assert.equal(complaint.slice(entities[0].start_offset, entities[0].end_offset), "gas pedal");
  assert.equal(complaint, "🚗 The gas pedal stuck.");
});

test("rejects malformed, incorrect-offset, unknown-category, and duplicate extractions", () => {
  const complaint = "engine stalled";
  const entity = { text: "engine", type: "Component", confidence: 8, start_offset: 0, end_offset: 6 };
  const corrected = validateExtraction({ entities: [{ ...entity, start_offset: 1 }] }, complaint, ["Component"]);
  assert.equal(corrected[0].start_offset, 0);
  assert.match(corrected[0].explanation ?? "", /Offsets repaired/);
  assert.throws(() => validateExtraction({ entities: [{ ...entity, text: "missing" }] }, complaint, ["Component"]), /offsets/);
  const repeated = validateExtraction({ entities: [{ ...entity, start_offset: 1 }] }, "engine engine", ["Component"]);
  assert.deepEqual(repeated.map((mention) => mention.start_offset), [0, 7]);
  assert.throws(() => validateExtraction({ entities: [{ ...entity, type: "Invented" }] }, complaint, ["Component"]), /category/);
  assert.throws(() => validateExtraction({ entities: [entity, entity] }, complaint, ["Component"]), /duplicate/);
  assert.throws(() => validateExtraction({ entities: [{ ...entity, confidence: 0 }] }, complaint, ["Component"]), /confidence/);
  assert.throws(() => validateExtraction({ entities: [{ ...entity, confidence: 11 }] }, complaint, ["Component"]), /confidence/);
  assert.throws(() => validateExtraction({ entities: [{ ...entity, confidence: 7.5 }] }, complaint, ["Component"]), /confidence/);
  assert.equal(validateExtraction({
    entities: [{ text: "engine", type: "Component", confidence: 0.9 }],
  }, complaint, ["Component"])[0].confidence, 9);
  assert.throws(() => validateExtraction({
    entities: [{
      text: entity.text,
      type: entity.type,
      start_offset: entity.start_offset,
      end_offset: entity.end_offset,
    }],
  }, complaint, ["Component"]), /confidence/);
  assert.throws(() => validateExtraction({ entities: "engine" }, complaint, ["Component"]));
});

test("derives every exact repeated span when a model omits offsets", () => {
  const complaint = "Braking action decreased; Braking action returned.";
  const mentions = validateExtraction({
    entities: [{ text: "Braking action", type: "Symptom", confidence: 8 }],
  }, complaint, ["Symptom"]);
  assert.deepEqual(mentions.map((mention) => complaint.slice(mention.start_offset, mention.end_offset)), [
    "Braking action",
    "Braking action",
  ]);
  assert.deepEqual(mentions.map((mention) => mention.start_offset), [0, 26]);
});

test("matches case and whitespace variants to exact original text and UTF-16 offsets", () => {
  const complaint = "🚗 Had  to\nswerve to avoid collision. The manufacturer and MANUFACTURER.";
  const mentions = validateExtraction({ entities: [
    { text: "had to swerve to avoid collision", type: "Symptom", confidence: 8 },
    { text: "Manufacturer", type: "Component", confidence: 9 },
  ] }, complaint, ["Symptom", "Component"]);
  assert.deepEqual(mentions.map((mention) => mention.text), [
    "Had  to\nswerve to avoid collision", "manufacturer", "MANUFACTURER",
  ]);
  for (const mention of mentions) {
    assert.equal(complaint.slice(mention.start_offset, mention.end_offset), mention.text);
  }
  assert.equal(mentions[0].start_offset, 3);
  assert.equal(mentions[0].originalOutput.text, "had to swerve to avoid collision");
  assert.deepEqual(restoreModelEntities(JSON.parse(JSON.stringify(mentions)), complaint, ["Symptom", "Component"]), mentions);
  assert.throws(() => validateExtraction({
    entities: [{ text: "Failure Mode", type: "Symptom", confidence: 8 }],
  }, complaint, ["Symptom"]), /no case\/whitespace-normalized match/);
});

test("normalizes model input and maps its offsets back to the original complaint", async () => {
  const previousFetch = globalThis.fetch;
  const complaint = "🚗  ENGINE\t\tStalled.\nHad to swerve.";
  try {
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const input = JSON.parse(request.messages[1].content) as { complaint: string };
      assert.equal(input.complaint, "🚗 engine stalled. had to swerve.");
      const start = input.complaint.indexOf("engine stalled");
      return Response.json({ message: { content: JSON.stringify({ entities: [{
        text: "ENGINE STALLED", type: "Symptom", confidence: 9,
        start_offset: start, end_offset: start + "engine stalled".length,
      }] }) } });
    };
    const [entity] = await extractModelEntities(complaint, ["Symptom"], ENTITY_MODELS[0]);
    assert.equal(entity.text, "ENGINE\t\tStalled");
    assert.equal(entity.start_offset, complaint.indexOf("ENGINE"));
    assert.equal(complaint.slice(entity.start_offset, entity.end_offset), entity.text);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("preserves character boundaries when lowercase expands a Unicode character", () => {
  const complaint = "İ  Brake";
  const [mention] = validateExtraction({ entities: [
    { text: "i\u0307 brake", type: "Component", confidence: 8 },
  ] }, complaint, ["Component"]);
  assert.equal(mention.text, complaint);
  assert.equal(mention.end_offset, complaint.length);
  assert.throws(() => validateExtraction({ entities: [
    { text: "\u0307", type: "Component", confidence: 8 },
  ] }, complaint, ["Component"]), /offsets/);
});

test("classifies confidence scores at the stated threshold", () => {
  assert.equal(ENTITY_CONFIDENCE_THRESHOLD, 25);
  assert.equal(isConfidentEntity(25), true);
  assert.equal(isConfidentEntity(30), true);
  assert.equal(isConfidentEntity(24), false);
  assert.equal(isConfidentEntity(null), false);
});

test("groups repeated phrases case-insensitively by category and uses the least confident scored occurrence", () => {
  const mentions = [
    { id: "1", exactText: "Toyota", labelId: "make", confidenceTotal: 29 },
    { id: "2", exactText: "toyota", labelId: "make", confidenceTotal: 10 },
    { id: "3", exactText: "Toyota", labelId: "vehicle", confidenceTotal: null },
  ];
  const groups = groupMentions(mentions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].mentions.length, 2);
  assert.equal(groups[0].level, "low");
  assert.equal(groups[1].level, "unscored");
});

test("counts exact phrase occurrences without matching inside other words", () => {
  const text = "Toyota, toyota; Toyotas and a Toyota.";
  assert.deepEqual(findPhraseOccurrences(text, "Toyota").map((span) => span.text), ["Toyota", "toyota", "Toyota"]);
  assert.deepEqual(findPhraseOccurrences("A+B and a+b", "A+B").map((span) => span.start), [0, 8]);
});

test("accepting missing occurrences preserves existing labels and records human decisions", async () => {
  const created: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];
  const tx = {
    annotation: {
      findMany: async () => [{ startOffset: 0, endOffset: 6 }, { startOffset: 22, endOffset: 28 }],
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "created" }; },
    },
    synonymTerm: { upsert: async () => ({ id: "term", alias: null }) },
    reviewDecision: { create: async ({ data }: { data: Record<string, unknown> }) => { decisions.push(data); } },
  } as unknown as Prisma.TransactionClient;
  await acceptMissingOccurrences(tx, {
    documentId: "doc", originalText: "Toyota and toyota and Toyota", phrase: "Toyota",
    labelId: "make", reviewer: "person", sourceAnnotationId: "source",
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].exactText, "toyota");
  assert.equal(created[0].startOffset, 11);
  assert.equal(created[0].createdByType, "HUMAN");
  assert.equal(created[0].status, "ACCEPTED");
  assert.equal(decisions.length, 1);
});

test("restores persisted model results without inventing offsets or votes", () => {
  const complaint = "engine stalled";
  const entities = validateExtraction({ entities: [{ text: "engine", type: "Component", confidence: 9 }] }, complaint, ["Component"]);
  const restored = restoreModelEntities(JSON.parse(JSON.stringify(entities)), complaint, ["Component"]);
  assert.deepEqual(restored[0].originalOutput, entities[0].originalOutput);
  assert.equal(aggregateEntityExtractions([{ model: ENTITY_MODELS[0], entities: restored }])[0].confidenceTotal, 9);
  assert.throws(() => restoreModelEntities([{ ...entities[0], text: "missing" }], complaint, ["Component"]), /offsets/);
});

test("sums model confidence only when models agree on a category and exact span", () => {
  const complaint = "Braking action failed.";
  const entity = (confidence: number, type = "Symptom") => ({
    ...validateExtraction({
      entities: [{
        text: "Braking action", type, confidence, start_offset: 0, end_offset: 14, status: "resolved",
      }],
    }, complaint, ["Symptom", "Component"])[0],
  });
  const results = aggregateEntityExtractions([
    { model: ENTITY_MODELS[0], entities: [entity(9)] },
    { model: ENTITY_MODELS[1], entities: [entity(8)] },
    { model: ENTITY_MODELS[2], entities: [entity(8), entity(7, "Component")] },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results.find((item) => item.type === "Symptom")?.confidenceTotal, 25);
  assert.equal(results.find((item) => item.type === "Symptom")?.modelScores[ENTITY_MODELS[2]], 8);
  assert.equal(results.find((item) => item.type === "Component")?.confidenceTotal, 7);
  assert.equal(results.find((item) => item.type === "Component")?.modelScores[ENTITY_MODELS[0]], 0);
});

test("groups repeated phrases by category and confidence group", () => {
  const mentions = [
    { id: "one", exactText: "braking action", labelId: "symptom", confidenceTotal: 25 },
    { id: "two", exactText: "braking action", labelId: "symptom", confidenceTotal: 27 },
    { id: "three", exactText: "braking action", labelId: "symptom", confidenceTotal: 24 },
    { id: "four", exactText: "braking action", labelId: "component", confidenceTotal: 25 },
  ];
  const groups = groupEntityMentions(mentions);
  assert.deepEqual(groups.map((group) => ({
    text: group.exactText,
    labelId: group.labelId,
    confident: group.confident,
    count: group.mentions.length,
  })), [
    { text: "braking action", labelId: "symptom", confident: true, count: 2 },
    { text: "braking action", labelId: "symptom", confident: false, count: 1 },
    { text: "braking action", labelId: "component", confident: true, count: 1 },
  ]);
});

test("validates contextual synonym proposals without automatically merging them", () => {
  const terms: LlmTerm[] = [
    { id: "a", text: "accelerator", category: "Component", contexts: ["The accelerator stuck."] },
    { id: "b", text: "gas pedal", category: "Component", contexts: ["The gas pedal stuck."] },
    { id: "c", text: "throttle body", category: "Component", contexts: ["The throttle body failed."] },
    { id: "d", text: "stalling", category: "Symptom", contexts: ["The car is stalling."] },
  ];
  const result = validateSynonymProposals({
    clusters: [{ canonical_name: "Accelerator pedal", aliases: ["a", "b"], status: "resolved", explanation: "Same pedal." }],
  }, terms);
  assert.deepEqual(result[0].aliases, ["a", "b"]);
  assert.throws(() => validateSynonymProposals({
    clusters: [{ canonical_name: "Engine", aliases: ["a", "d"], status: "needs_review", explanation: "Unclear." }],
  }, terms), /incompatible/);
  assert.throws(() => validateSynonymProposals({
    clusters: [
      { canonical_name: "Accelerator", aliases: ["a", "b"], status: "resolved", explanation: "Same." },
      { canonical_name: null, aliases: ["a", "c"], status: "needs_review", explanation: "Unclear." },
    ],
  }, terms), /multiple groups/);
  assert.throws(() => validateSynonymProposals({
    clusters: [{ canonical_name: "Unknown", aliases: ["a", "missing"], status: "resolved", explanation: "" }],
  }, terms), /unknown term/);
});

test("retries malformed synonym groups with schema and validation feedback", async () => {
  const previousFetch = globalThis.fetch;
  const terms: LlmTerm[] = [
    { id: "a", text: "accelerator", category: "Component", contexts: [] },
    { id: "b", text: "gas pedal", category: "Component", contexts: [] },
  ];
  const requests: Array<{ format: unknown; messages: Array<{ content: string }> }> = [];
  try {
    globalThis.fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      const output = requests.length === 1
        ? { clusters: [{ canonical_name: "pedal", aliases: ["t1"], status: "confirmed", explanation: "" }] }
        : { clusters: [{ canonical_name: "pedal", aliases: ["t1", "t2"], status: "resolved", explanation: "Same part." }] };
      return Response.json({ message: { content: JSON.stringify(output) } });
    };
    const result = await proposeSynonyms(terms);
    assert.deepEqual(result[0].aliases, ["a", "b"]);
    assert.equal(requests.length, 2);
    assert.equal(typeof requests[0].format, "object");
    const input = JSON.parse(requests[0].messages[1].content) as { terms: LlmTerm[] };
    assert.deepEqual(input.terms.map((term) => term.id), ["t1", "t2"]);
    const retry = JSON.parse(requests[1].messages[1].content) as { validationError: string };
    assert.match(retry.validationError, /aliases/);
    assert.match(retry.validationError, /status/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("reports invalid synonym groups after one retry and rejects unknown IDs", async () => {
  const previousFetch = globalThis.fetch;
  const terms: LlmTerm[] = [
    { id: "a", text: "engine", category: "Component", contexts: [] },
    { id: "b", text: "motor", category: "Component", contexts: [] },
  ];
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests++;
      return Response.json({ message: { content: JSON.stringify({
        clusters: [{ canonical_name: "engine", aliases: ["t1", "unknown"], status: "resolved", explanation: "" }],
      }) } });
    };
    await assert.rejects(proposeSynonyms(terms), /invalid synonym groups twice.*unknown term ID/);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("human correction is validated, recorded, and linked without modifying the complaint", async () => {
  const originalText = "The gas pedal stuck.";
  const changes: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];
  const transaction = {
    annotation: {
      findUnique: async () => ({
        id: "mention", status: "PROPOSED", documentId: "doc",
        exactText: "gas", startOffset: 4, endOffset: 7, labelId: "part",
        confidenceTotal: 16, modelConfidenceScores: { "qwen3.5:4b": 8, "granite4:3b": 8, "gemma4:e4b": 0 },
        document: { originalText, dataset: { labelSchemaId: "schema" } },
      }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { changes.push(data); return { count: 1 }; },
      count: async () => 0,
    },
    label: { findFirst: async () => ({ id: "part" }) },
    synonymTerm: { upsert: async () => ({ id: "term", alias: { entityId: "entity" } }) },
    reviewDecision: { create: async ({ data }: { data: Record<string, unknown> }) => { decisions.push(data); } },
    document: { update: async () => ({}) },
  } as unknown as Prisma.TransactionClient;
  const input = {
    annotationId: "mention", reviewer: "reviewer", action: "accept" as const,
    exactText: "gas pedal", startOffset: 4, endOffset: 13, labelId: "part",
  };
  await assert.rejects(applyEntityReview(transaction, { ...input, endOffset: 12 }), /exactly match/);
  assert.equal(changes.length, 0);
  const result = await applyEntityReview(transaction, input);
  assert.equal(result.status, "ACCEPTED");
  assert.equal(changes[0].entityId, "entity");
  assert.equal(changes[0].exactText, "gas pedal");
  assert.equal(changes[0].confidenceTotal, null);
  assert.deepEqual(decisions[0].details, {
    original: { exactText: "gas", startOffset: 4, endOffset: 7, labelId: "part", confidenceTotal: 16,
      modelConfidenceScores: { "qwen3.5:4b": 8, "granite4:3b": 8, "gemma4:e4b": 0 } },
    corrected: { exactText: "gas pedal", startOffset: 4, endOffset: 13, labelId: "part" },
  });

  assert.equal(originalText, "The gas pedal stuck.");
  await applyEntityReview(transaction, { ...input, exactText: "gas", endOffset: 7 });
  assert.equal("confidenceTotal" in changes[1], false);
  assert.equal("modelConfidenceScores" in changes[1], false);
});

test("group decisions update matching pending occurrences without modifying their spans", async () => {
    const document = { originalText: "Toyota and toyota", dataset: { labelSchemaId: "schema" } };
    const rows = [
      { id: "a", status: "PROPOSED", documentId: "doc", exactText: "Toyota", startOffset: 0, endOffset: 6, labelId: "make", confidenceTotal: 12, modelConfidenceScores: null, document },
      { id: "b", status: "PROPOSED", documentId: "doc", exactText: "toyota", startOffset: 11, endOffset: 17, labelId: "make", confidenceTotal: 9, modelConfidenceScores: null, document },
    ];
    const changes: Array<{ id: string; data: Record<string, unknown> }> = [];
    const transaction = {
      annotation: {
        findUnique: async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id),
        findMany: async () => rows,
        updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { changes.push({ id: where.id, data }); return { count: 1 }; },
        count: async () => 1,
      },
      label: { findFirst: async () => ({ id: "make" }) },
      synonymTerm: { upsert: async () => ({ id: "term", alias: null }) },
      reviewDecision: { create: async () => ({}) },
      document: { update: async () => ({}) },
    } as unknown as Prisma.TransactionClient;
    const input = {
      annotationId: "a", reviewer: "reviewer", action: "accept" as const, labelId: "make",
      exactText: "Toyota", startOffset: 0, endOffset: 6, occurrenceIds: ["a", "b"],
    };
    await assert.rejects(applyEntityReview(transaction, { ...input, endOffset: 5 }), /exactly match/);
    const result = await applyEntityReview(transaction, input);
    assert.equal(result.reviewed, 2);
    assert.deepEqual(changes.map((change) => [change.id, change.data.startOffset, change.data.endOffset]), [["a", 0, 6], ["b", 11, 17]]);
    assert.ok(changes.every((change) => change.data.status === "ACCEPTED"));
    rows[1].status = "ACCEPTED";
    await assert.rejects(applyEntityReview(transaction, input), /already reviewed/);
});
