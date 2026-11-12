import assert from "node:assert/strict";
import test from "node:test";
import {
  complaintSourceId,
  complaintVehicle,
  fetchComplaints,
  nextUnimportedComplaints,
} from "@/lib/nhtsa";

test("selects only the next 30 unique unimported NHTSA complaint IDs", () => {
  const records = Array.from({ length: 34 }, (_, index) => ({
    odiNumber: index + 1,
    summary: `Complaint ${index + 1}`,
  }));
  records.push({ odiNumber: 1, summary: "Duplicate source record" });
  const selected = nextUnimportedComplaints(records, new Set(["1", "2"]));

  assert.equal(selected.length, 30);
  assert.equal(complaintSourceId(selected[0]!), "3");
  assert.equal(complaintSourceId(selected.at(-1)!), "32");
});

test("rejects records without IDs and preserves matched vehicle metadata", () => {
  assert.equal(complaintSourceId({ summary: "No ID" }), null);
  assert.deepEqual(
    complaintVehicle({
      odiNumber: 10,
      products: [{ productMake: "Toyota", productModel: "Prius", productYear: "2005" }],
    }, { make: "Toyota", model: "Prius", year: 2005 }),
    { make: "Toyota", model: "Prius", year: 2005 },
  );
});

test("accepts NHTSA's empty-results HTTP 400 response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 400 });
  try {
    assert.deepEqual(await fetchComplaints("Toyota", "Prius", 2005), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
