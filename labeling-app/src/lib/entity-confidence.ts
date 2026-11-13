export const ENTITY_CONFIDENCE_THRESHOLD = 25;
export const ENTITY_MODEL_NAMES = ["qwen3.5:4b", "gemma4:e4b", "granite4:3b"] as const;

export function isConfidentEntity(confidenceTotal: number | null): boolean {
  return confidenceTotal !== null && confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD;
}

export type EntityMentionForGrouping = {
  exactText: string;
  labelId: string;
  confidenceTotal: number | null;
};

export type EntityMentionGroup<T extends EntityMentionForGrouping> = {
  exactText: string;
  labelId: string;
  confident: boolean;
  mentions: T[];
};

export function groupEntityMentions<T extends EntityMentionForGrouping>(mentions: T[]): EntityMentionGroup<T>[] {
  const groups = new Map<string, EntityMentionGroup<T>>();
  for (const mention of mentions) {
    const confident = isConfidentEntity(mention.confidenceTotal);
    const key = `${mention.labelId}\0${mention.exactText}\0${confident}`;
    const group = groups.get(key);
    if (group) {
      group.mentions.push(mention);
    } else {
      groups.set(key, { exactText: mention.exactText, labelId: mention.labelId, confident, mentions: [mention] });
    }
  }
  return [...groups.values()];
}
