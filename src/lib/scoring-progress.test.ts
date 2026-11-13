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
    ["a"],
    async (phase, selected, excluded) => {
      assert.deepEqual(selected, ["a"]);
      calls.push(phase);
      return { results: excluded.length ? [] : [{ documentId: "a", status: phase === ENTITY_MODEL_NAMES[0] ? "failed" : "completed" }] };
    },
    () => {},
  );
  assert.deepEqual(phases.map((item) => item.phase), [...ENTITY_MODEL_NAMES, "compare"]);
  assert.deepEqual(calls, [...ENTITY_MODEL_NAMES.flatMap((model) => [model, model]), "compare", "compare"]);
  assert.equal(phases[0].results[0].status, "failed");
});

test("keeps the same three documents across all phases, including partially cached and failed work", async () => {
  const selected = ["a", "b", "c"];
  const available: ScoringResult[] = ["a", "b", "c", "d", "e"].map((documentId) => ({ documentId, status: "completed" }));
  const calls: Array<{ phase: string; selected: string[] }> = [];
  const phases = await runScoringPhases(
    selected,
    async (phase, ids, excluded) => {
      calls.push({ phase, selected: [...ids] });
      const results = available.filter((item) =>
        ids.includes(item.documentId) &&
        !excluded.includes(item.documentId) &&
        !(phase === ENTITY_MODEL_NAMES[1] && item.documentId === "a") &&
        !(phase === "compare" && item.documentId === "b"),
      ).slice(0, 1).map((item) =>
        phase === ENTITY_MODEL_NAMES[0] && item.documentId === "b" ? { ...item, status: "failed" as const } : item,
      );
      return { results };
    },
    () => {},
  );
  for (const call of calls) assert.deepEqual(call.selected, selected);
  assert.deepEqual(phases.map(({ results }) => results.map((item) => item.documentId)), [
    ["a", "b", "c"], ["b", "c"], ["a", "b", "c"], ["a", "c"],
  ]);
  assert.equal(phases[0].results[1].status, "failed");
});

test("rejects oversized or duplicate cohorts and unexpected results", async () => {
  const request = async () => ({ results: [{ documentId: "outside", status: "completed" as const }] });
  await assert.rejects(runScoringPhases(["a", "b", "c", "d"], request, () => {}), /at most three/);
  await assert.rejects(runScoringPhases(["a", "a"], request, () => {}), /distinct/);
  await assert.rejects(runScoringPhases(["a"], request, () => {}), /outside this run/);
});

test("does not make scoring requests when no unscored documents remain", async () => {
  const phases = await runScoringPhases([], async () => { throw new Error("Unexpected request"); }, () => {});
  assert.equal(phases.length, 4);
  assert.ok(phases.every(({ results }) => results.length === 0));
});
