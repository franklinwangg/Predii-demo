import assert from "node:assert/strict";
import test from "node:test";
import { runScoringPhases, runScoringQueue } from "@/lib/scoring-progress";
import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";
import type { ScoringResult } from "@/lib/scoring-progress";

test("reports each result and continues after failures without retrying within a pass", async () => {
  const available: ScoringResult[] = [
    { documentId: "a", status: "failed", error: "Invalid output" },
    { documentId: "b", status: "completed" },
    { documentId: "c", status: "busy" },
  ];
  const updates: ScoringResult[][] = [];
  const results = await runScoringQueue(
    async (excluded) => ({ results: available.filter((item) => !excluded.includes(item.documentId)).slice(0, 1) }),
    (update) => updates.push(update),
  );
  assert.deepEqual(results, available);
  assert.deepEqual(updates.map((update) => update.length), [1, 2, 3]);
});

test("rejects a service that repeats an already attempted complaint", async () => {
  await assert.rejects(runScoringQueue(
    async () => ({ results: [{ documentId: "a", status: "failed" }] }),
    () => {},
  ), /more than once/);
});

test("processes every model before comparing, and continues after model failures", async () => {
  const calls: string[] = [];
  const phases = await runScoringPhases(
    async (phase, excluded) => {
      calls.push(phase);
      return { results: excluded.length ? [] : [{ documentId: "a", status: phase === ENTITY_MODEL_NAMES[0] ? "failed" : "completed" }] };
    },
    () => {},
  );
  assert.deepEqual(phases.map((item) => item.phase), [...ENTITY_MODEL_NAMES, "compare"]);
  assert.deepEqual(calls, [...ENTITY_MODEL_NAMES.flatMap((model) => [model, model]), "compare", "compare"]);
  assert.equal(phases[0].results[0].status, "failed");
});
