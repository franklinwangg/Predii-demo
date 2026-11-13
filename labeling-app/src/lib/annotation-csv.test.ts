import assert from "node:assert/strict";
import test from "node:test";
import { annotationsToCsv } from "@/lib/annotation-csv";

test("exports an accepted occurrence with escaped values and per-model votes", () => {
  const csv = annotationsToCsv([{
    id: "annotation", exactText: 'part, "A"\nsecond line', startOffset: 3, endOffset: 8,
    createdBy: "=reviewer", createdByType: "AI", confidenceTotal: 25,
    modelConfidenceScores: { "qwen3.5:4b": 9, "gemma4:e4b": 8, "granite4:3b": 8 },
    label: { name: "Component" }, entity: null,
    document: { sourceId: "123", dataset: { name: "Cars" }, vehicleMake: "Toyota", vehicleModel: "Prius", vehicleYear: 2005 },
  }]);
  assert.ok(csv.startsWith('\uFEFF"dataset","complaint_id"'));
  assert.match(csv, /"part, ""A""\nsecond line"/);
  assert.match(csv, /"'=reviewer"/);
  assert.match(csv, /"25","9","8","8","annotation"/);
  assert.ok(csv.endsWith("\r\n"));
});

test("empty export has headers and no rows", () => {
  assert.equal(annotationsToCsv([]).split("\r\n").length, 2);
});
