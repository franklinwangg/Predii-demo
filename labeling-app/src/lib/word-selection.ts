export type WordRange = { start: number; end: number };
export type WordSelection = { anchor: number; focus: number };

export function getWords(text: string): WordRange[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  return Array.from(segmenter.segment(text))
    .filter((segment) => segment.isWordLike)
    .map((segment) => ({ start: segment.index, end: segment.index + segment.segment.length }));
}

export function wordSelectionFromRange(
  words: WordRange[],
  start: number,
  end: number,
  backwards: boolean,
): WordSelection | null {
  const first = words.findIndex((word) => word.end > start && word.start < end);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < words.length && words[last + 1].start < end) last++;
  return backwards ? { anchor: last, focus: first } : { anchor: first, focus: last };
}

export function moveWordSelection(
  words: WordRange[],
  current: WordSelection | null,
  caret: number | null,
  direction: -1 | 1,
  extend: boolean,
): WordSelection | null {
  if (!words.length) return null;
  if (!current) {
    let index: number;
    if (caret === null) {
      index = direction === 1 ? 0 : words.length - 1;
    } else if (direction === 1) {
      index = words.findIndex((word) => word.end > caret);
      if (index < 0) index = words.length - 1;
    } else {
      index = words.length - 1;
      while (index > 0 && words[index].start >= caret) index--;
    }
    return { anchor: index, focus: index };
  }
  const focus = Math.max(0, Math.min(words.length - 1, current.focus + direction));
  return { anchor: extend ? current.anchor : focus, focus };
}
