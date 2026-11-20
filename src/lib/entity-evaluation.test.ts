import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEntityPredictions, getLabeledEntities } from "@/lib/entity-evaluation";

test("evaluates standalone component and failure-mode predictions with category-aware lexical matching", () => {
  const groundTruth = getLabeledEntities({
    components: ["brake actuator"],
    failure_modes: ["brakes fail to stop vehicle"],
  });
  const metrics = evaluateEntityPredictions([
    { text: "brake actuator", type: "Component" },
    { text: "brakes fail to stop", type: "Failure Mode" },
    { text: "warning light", type: "Component" },
  ], groundTruth);
  assert.deepEqual(metrics, {
    precision: 2 / 3,
    recall: 1,
    f1: 0.8,
    truePositives: 2,
    falsePositives: 1,
    falseNegatives: 0,
  });
});

test("counts wrong categories as a false positive and a false negative", () => {
  const metrics = evaluateEntityPredictions(
    [{ text: "brake actuator", type: "Failure Mode" }],
    [{ text: "brake actuator", type: "Component" }],
  );
  assert.equal(metrics.truePositives, 0);
  assert.equal(metrics.falsePositives, 1);
  assert.equal(metrics.falseNegatives, 1);
  assert.equal(metrics.f1, 0);
});

test("one prediction cannot match multiple ground-truth labels", () => {
  const metrics = evaluateEntityPredictions(
    [{ text: "braking system", type: "Component" }],
    [
      { text: "braking system", type: "Component" },
      { text: "braking system", type: "Component" },
    ],
  );
  assert.equal(metrics.truePositives, 1);
  assert.equal(metrics.falseNegatives, 1);
});
