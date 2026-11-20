import assert from "node:assert/strict";
import test from "node:test";
import { annotationsToCsv, entitiesToCsv } from "@/lib/annotation-csv";

test("exports an accepted occurrence with its individual model score", () => {
  const csv = annotationsToCsv([{
    id: "annotation", exactText: 'part, "A"\nsecond line', startOffset: 3, endOffset: 8,
    createdBy: "=reviewer", createdByType: "AI", confidenceScore: 9,
    label: { name: "Component" }, entity: null,
    document: { sourceId: "123", dataset: { name: "Cars" }, vehicleMake: "Toyota", vehicleModel: "Prius", vehicleYear: 2005 },
  }]);
  assert.ok(csv.startsWith('\uFEFF"dataset","complaint_id"'));
  assert.match(csv, /"part, ""A""\nsecond line"/);
  assert.match(csv, /"'=reviewer"/);
  assert.match(csv, /"9","annotation"/);
  assert.ok(csv.endsWith("\r\n"));
});

test("empty export has headers and no rows", () => {
  assert.equal(annotationsToCsv([]).split("\r\n").length, 2);
});

test("exports distinct accepted phrases and categories in the requested one-column format", () => {
  const csv = entitiesToCsv([
    { exactText: "Toyota", label: { name: "Manufacturer" } },
    { exactText: "toyota", label: { name: "Manufacturer" } },
    { exactText: "Toyota", label: { name: "Vehicle" } },
    { exactText: 'part, "A"\nsecond line', label: { name: "Component" } },
    { exactText: "=SUM(1,2)", label: { name: "Component" } },
  ]);
  assert.equal(csv, '\uFEFF"entity : category"\r\n"Toyota : Manufacturer"\r\n"Toyota : Vehicle"\r\n' +
    '"part, ""A""\nsecond line : Component"\r\n"\'=SUM(1,2) : Component"\r\n');
});

test("empty entity list includes only its header", () => {
  assert.equal(entitiesToCsv([]), '\uFEFF"entity : category"\r\n');
});
