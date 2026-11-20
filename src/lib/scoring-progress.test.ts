import assert from "node:assert/strict";
import test from "node:test";
import { runScoringModel, runScoringQueue } from "@/lib/scoring-progress";
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

test("runs only the selected model and continues after failures", async () => {
  const calls: string[] = [];
  const results = await runScoringModel(
    ["a", "b"],
    ENTITY_MODEL_NAMES[1],
    async (model, selected, excluded) => {
      assert.deepEqual(selected, ["a", "b"]);
      calls.push(model);
      const documentId = selected.find((id) => !excluded.includes(id));
      return {
        results: documentId ? [{
          documentId,
          status: documentId === "a" ? "failed" : "completed",
        }] : [],
      };
    },
    () => {},
  );
  assert.deepEqual(calls, [ENTITY_MODEL_NAMES[1], ENTITY_MODEL_NAMES[1], ENTITY_MODEL_NAMES[1]]);
  assert.deepEqual(results.map((result) => result.status), ["failed", "completed"]);
});

test("rejects oversized or duplicate cohorts and unexpected results", async () => {
  const request = async () => ({ results: [{ documentId: "outside", status: "completed" as const }] });
  await assert.rejects(runScoringModel(["a", "b", "c", "d"], ENTITY_MODEL_NAMES[0], request, () => {}), /at most three/);
  await assert.rejects(runScoringModel(["a", "a"], ENTITY_MODEL_NAMES[0], request, () => {}), /distinct/);
  await assert.rejects(runScoringModel(["a"], ENTITY_MODEL_NAMES[0], request, () => {}), /outside this run/);
});

test("does not make scoring requests when no unscored documents remain", async () => {
  const results = await runScoringModel([], ENTITY_MODEL_NAMES[0], async () => { throw new Error("Unexpected request"); }, () => {});
  assert.equal(results.length, 0);
});
