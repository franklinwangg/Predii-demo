import assert from "node:assert/strict";
import test from "node:test";
import { isValidTextSpan, splitAnnotatedText } from "@/lib/text-spans";
import { getWords, moveWordSelection, wordSelectionFromRange } from "@/lib/word-selection";

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

test("navigates words, extends and shrinks selections, and clamps at the ends", () => {
  const text = "Engine, warning light!\nwon't stop";
  const words = getWords(text);
  assert.deepEqual(words.map(({ start, end }) => text.slice(start, end)),
    ["Engine", "warning", "light", "won't", "stop"]);
  let selection = moveWordSelection(words, null, null, 1, false);
  assert.deepEqual(selection, { anchor: 0, focus: 0 });
  selection = moveWordSelection(words, selection, null, 1, true);
  assert.deepEqual(selection, { anchor: 0, focus: 1 });
  assert.equal(text.slice(words[selection!.anchor].start, words[selection!.focus].end), "Engine, warning");
  selection = moveWordSelection(words, selection, null, -1, true);
  assert.deepEqual(selection, { anchor: 0, focus: 0 });
  selection = moveWordSelection(words, selection, null, -1, true);
  assert.deepEqual(selection, { anchor: 0, focus: 0 });
  assert.deepEqual(moveWordSelection(words, null, null, -1, false), { anchor: 4, focus: 4 });
  assert.deepEqual(moveWordSelection(words, null, 9, 1, false), { anchor: 1, focus: 1 });
  assert.deepEqual(moveWordSelection(words, null, 8, -1, false), { anchor: 0, focus: 0 });
  assert.deepEqual(moveWordSelection(words, { anchor: 1, focus: 1 }, null, -1, true), { anchor: 1, focus: 0 });
  assert.deepEqual(moveWordSelection(words, { anchor: 1, focus: 0 }, null, 1, false), { anchor: 1, focus: 1 });
  assert.equal(moveWordSelection([], null, null, 1, false), null);
});

test("maps mouse-selected text to word navigation, including backwards selections", () => {
  const words = getWords("airbag warning light");
  assert.deepEqual(wordSelectionFromRange(words, 2, 14, false), { anchor: 0, focus: 1 });
  assert.deepEqual(wordSelectionFromRange(words, 2, 14, true), { anchor: 1, focus: 0 });
  assert.equal(wordSelectionFromRange(words, 6, 7, false), null);
});

test("word offsets preserve Unicode text and punctuation", () => {
  const text = "🚗 café — 车门";
  const words = getWords(text);
  assert.equal(text.slice(words[0].start, words[0].end), "café");
  assert.equal(words.slice(1).map(({ start, end }) => text.slice(start, end)).join(""), "车门");
});
