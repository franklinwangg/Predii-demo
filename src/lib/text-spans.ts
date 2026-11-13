export type TextSpan = {
  exactText: string;
  startOffset: number;
  endOffset: number;
  label: { name: string; color: string };
};

export type TextSegment = {
  start: number;
  end: number;
  text: string;
  annotations: TextSpan[];
};

export function isValidTextSpan(
  originalText: string,
  exactText: string,
  startOffset: number,
  endOffset: number,
) {
  return (
    Number.isInteger(startOffset) &&
    Number.isInteger(endOffset) &&
    startOffset >= 0 &&
    startOffset < endOffset &&
    endOffset <= originalText.length &&
    originalText.slice(startOffset, endOffset) === exactText
  );
}

export function splitAnnotatedText(
  text: string,
  annotations: TextSpan[],
): TextSegment[] {
  const valid = annotations.filter((annotation) =>
    isValidTextSpan(
      text,
      annotation.exactText,
      annotation.startOffset,
      annotation.endOffset,
    ),
  );
  const boundaries = new Set([0, text.length]);
  for (const annotation of valid) {
    boundaries.add(annotation.startOffset);
    boundaries.add(annotation.endOffset);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    if (end === undefined || start === end) return [];
    return [{
      start,
      end,
      text: text.slice(start, end),
      annotations: valid.filter(
        (annotation) => annotation.startOffset <= start && annotation.endOffset >= end,
      ),
    }];
  });
}
