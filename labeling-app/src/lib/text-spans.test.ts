import assert from "node:assert/strict";
import test from "node:test";
import { isValidTextSpan, splitAnnotatedText } from "@/lib/text-spans";

test("validates exact text against inclusive/exclusive offsets", () => {
  const text = "airbag light, airbag light";
  assert.equal(isValidTextSpan(text, "airbag light", 0, 12), true);
  assert.equal(isValidTextSpan(text, "airbag light", 14, 26), true);
  assert.equal(isValidTextSpan(text, "airbag light", 1, 13), false);
  assert.equal(isValidTextSpan(text, "airbag", -1, 5), false);
  assert.equal(isValidTextSpan(text, "", 0, 0), false);
});

test("preserves text and marks overlap and adjacent spans without shifting offsets", () => {
  const text = "engine light and brake";
  const segments = splitAnnotatedText(text, [
    { exactText: "engine light", startOffset: 0, endOffset: 12, label: { name: "Component", color: "#123456" } },
    { exactText: "light and", startOffset: 7, endOffset: 16, label: { name: "Symptom", color: "#abcdef" } },
    { exactText: " ", startOffset: 16, endOffset: 17, label: { name: "Other", color: "#777777" } },
    { exactText: "brake", startOffset: 17, endOffset: 22, label: { name: "Component", color: "#123456" } },
    { exactText: "wrong phrase", startOffset: 0, endOffset: 5, label: { name: "Other", color: "#777777" } },
  ]);

  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.deepEqual(
    segments.filter((segment) => segment.annotations.length > 1).map((segment) => segment.text),
    ["light"],
  );
  assert.equal(segments.at(-1)?.start, 17);
  assert.equal(segments.at(-1)?.text, "brake");
  assert.equal(segments.at(-1)?.annotations[0]?.label.name, "Component");
});
