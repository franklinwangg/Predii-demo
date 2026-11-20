import { isConfidentEntity } from "@/lib/entity-confidence";

export type GroupableMention = {
  id: string;
  exactText: string;
  labelId: string;
  confidenceScore: number | null;
};

export function phraseKey(text: string): string {
  return text.toLocaleLowerCase("en-US");
}

export function findPhraseOccurrences(complaint: string, phrase: string): Array<{ start: number; end: number; text: string }> {
  if (!phrase) return [];
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = /[\p{L}\p{N}_]/u;
  const startBoundary = word.test(phrase[0]) ? "(?<![\\p{L}\\p{N}_])" : "";
  const endBoundary = word.test(phrase[phrase.length - 1]) ? "(?![\\p{L}\\p{N}_])" : "";
  const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "giu");
  return [...complaint.matchAll(regex)].map((match) => ({
    start: match.index, end: match.index + match[0].length, text: match[0],
  }));
}

export function groupMentions<T extends GroupableMention>(mentions: T[]) {
  const groups = new Map<string, T[]>();
  for (const mention of mentions) {
    const key = `${mention.labelId}\0${phraseKey(mention.exactText)}`;
    const group = groups.get(key) ?? [];
    group.push(mention);
    groups.set(key, group);
  }
  return [...groups.values()].map((items) => ({
    mentions: items,
    level: items.some((item) => item.confidenceScore !== null && !isConfidentEntity(item.confidenceScore))
      ? "low" as const
      : items.some((item) => item.confidenceScore === null || item.confidenceScore > 10)
        ? "unscored" as const
        : "high" as const,
  }));
}
