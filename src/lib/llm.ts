import { createHash } from "node:crypto";
import { z } from "zod";
import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";
import {
  ACTIVE_ENTITY_EXTRACTION_PROMPT_ID,
  ENTITY_EXTRACTION_PROMPT,
  SYNONYM_GROUPING_PROMPT,
} from "@/lib/prompts";
import { isValidTextSpan } from "@/lib/text-spans";

export const ENTITY_MODELS = ENTITY_MODEL_NAMES;

const extractionSchema = z.object({
  entities: z.array(z.object({
    text: z.string().min(1),
    type: z.string().min(1),
    confidence: z.number().min(0).max(10),
    start_offset: z.number().int().nonnegative().optional(),
    end_offset: z.number().int().positive().optional(),
    explanation: z.string().optional(),
  })).max(500),
});
const storedEntitySchema = extractionSchema.shape.entities.element.extend({
  start_offset: z.number().int().nonnegative(),
  end_offset: z.number().int().positive(),
  originalOutput: extractionSchema.shape.entities.element,
});

const synonymSchema = z.object({
  clusters: z.array(z.object({
    canonical_name: z.string().trim().min(1).nullable(),
    aliases: z.array(z.string().min(1)).min(2),
    status: z.enum(["resolved", "needs_review"]),
    explanation: z.string(),
  })).max(100),
});

export type ExtractedEntity = z.infer<typeof extractionSchema>["entities"][number];
export type ValidatedEntity = ExtractedEntity & {
  start_offset: number;
  end_offset: number;
  originalOutput: ExtractedEntity;
};
export type SynonymProposal = z.infer<typeof synonymSchema>["clusters"][number];
export type LlmTerm = { id: string; text: string; category: string; contexts: string[] };

class SynonymValidationError extends Error {}

export function llmConfig() {
  const url = process.env.LLM_API_URL || "http://127.0.0.1:11434/api/chat";
  const model = process.env.LLM_MODEL || "qwen2.5:7b";
  return { url, model, key: process.env.LLM_API_KEY };
}

export function modelPipelineKey(model: string): string {
  const { url } = llmConfig();
  return createHash("sha256")
    .update(`extraction-v8-single-model\0${ACTIVE_ENTITY_EXTRACTION_PROMPT_ID}\0${ENTITY_EXTRACTION_PROMPT}\0${url}\0${model}`)
    .digest("hex");
}

function normalizeComplaintText(text: string) {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let offset = 0; offset < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(offset)!);
    const start = offset;
    offset += character.length;
    if (/\s/u.test(character)) {
      while (offset < text.length) {
        const next = String.fromCodePoint(text.codePointAt(offset)!);
        if (!/\s/u.test(next)) break;
        offset += next.length;
      }
      normalized += " ";
      starts.push(start);
      ends.push(offset);
    } else {
      const lowered = character.toLowerCase();
      normalized += lowered;
      for (let i = 0; i < lowered.length; i++) {
        starts.push(start);
        ends.push(offset);
      }
    }
  }
  return { text: normalized, starts, ends };
}

function originalSpan(
  normalized: ReturnType<typeof normalizeComplaintText>,
  start: number,
  end: number,
) {
  if (start < 0 || start >= end || end > normalized.text.length ||
      (start > 0 && normalized.starts[start] === normalized.starts[start - 1]) ||
      (end < normalized.text.length && normalized.ends[end - 1] === normalized.ends[end])) return null;
  return { start: normalized.starts[start], end: normalized.ends[end - 1] };
}

export function validateExtraction(
  output: unknown,
  complaint: string,
  categories: string[],
  offsetsReferToNormalizedText = false,
): ValidatedEntity[] {
  const parsed = extractionSchema.parse(output);
  const normalized = normalizeComplaintText(complaint);
  const seen = new Set<string>();
  const validated: ValidatedEntity[] = [];
  for (const original of parsed.entities) {
    const entity = {
      ...original,
      confidence: normalizeConfidence(original.confidence),
    };
    if (!categories.includes(entity.type)) {
      throw new Error(`Unknown entity category: ${entity.type}`);
    }
    const normalizedEntity = normalizeComplaintText(entity.text).text.trim();
    const spans: Array<{ start: number; end: number }> = [];
    if (entity.start_offset !== undefined &&
        entity.end_offset !== undefined) {
      if (offsetsReferToNormalizedText) {
        const span = originalSpan(normalized, entity.start_offset, entity.end_offset);
        if (span && normalized.text.slice(entity.start_offset, entity.end_offset) === normalizedEntity) spans.push(span);
      } else if (isValidTextSpan(complaint, entity.text, entity.start_offset, entity.end_offset)) {
        spans.push({ start: entity.start_offset, end: entity.end_offset });
      }
    }
    const hasValidOffsets = spans.length > 0;
    if (!hasValidOffsets && normalizedEntity) {
      let start = normalized.text.indexOf(normalizedEntity);
      while (start >= 0) {
        const span = originalSpan(normalized, start, start + normalizedEntity.length);
        if (span) spans.push(span);
        start = normalized.text.indexOf(normalizedEntity, start + 1);
      }
    }
    if (!spans.length) {
      throw new Error(`Invalid offsets or no case/whitespace-normalized match for extracted text: ${JSON.stringify(entity.text)}`);
    }
    for (const span of spans) {
      const key = `${span.start}:${span.end}:${entity.type}`;
      if (seen.has(key)) throw new Error("The LLM returned a duplicate extraction.");
      seen.add(key);
      validated.push({
        ...entity,
        text: complaint.slice(span.start, span.end),
        start_offset: span.start,
        end_offset: span.end,
        ...(!hasValidOffsets ? {
          explanation: [entity.explanation, "Offsets repaired or derived from case/whitespace-normalized text matches."].filter(Boolean).join(" "),
        } : {}),
        originalOutput: original,
      });
    }
  }
  return validated;
}

export function restoreModelEntities(output: unknown, complaint: string, categories: string[]): ValidatedEntity[] {
  const stored = z.array(storedEntitySchema).parse(output);
  if (stored.some((entity) => !isValidTextSpan(complaint, entity.text, entity.start_offset, entity.end_offset))) {
    throw new Error("Stored model output contains invalid offsets.");
  }
  const checked = validateExtraction({ entities: stored }, complaint, categories);
  if (checked.length !== stored.length || checked.some((entity, index) =>
    entity.start_offset !== stored[index].start_offset || entity.end_offset !== stored[index].end_offset)) {
    throw new Error("Stored model output contains invalid offsets.");
  }
  return checked.map((entity, index) => ({ ...entity, originalOutput: stored[index].originalOutput }));
}

function normalizeConfidence(confidence: number): number {
  if (Number.isInteger(confidence) && confidence >= 1 && confidence <= 10) return confidence;
  if (confidence > 0 && confidence <= 1) {
    return Math.max(1, Math.min(10, Math.round(confidence * 10)));
  }
  throw new Error("The LLM confidence score must be an integer from 1 to 10.");
}

export function validateSynonymProposals(output: unknown, terms: LlmTerm[]): SynonymProposal[] {
  const parsed = synonymSchema.parse(output);
  const known = new Map(terms.map((term) => [term.id, term]));
  const seen = new Set<string>();
  for (const cluster of parsed.clusters) {
    const categories = new Set<string>();
    for (const id of cluster.aliases) {
      const term = known.get(id);
      if (!term) throw new SynonymValidationError(`LLM returned an unknown term ID: ${id}`);
      if (seen.has(id)) throw new SynonymValidationError(`LLM returned a term in multiple groups: ${id}`);
      seen.add(id);
      categories.add(term.category);
    }
    if (categories.size !== 1) throw new SynonymValidationError("LLM proposed a group across incompatible categories.");
    if (cluster.status === "resolved" && !cluster.canonical_name) {
      throw new SynonymValidationError("A resolved synonym proposal must have a canonical name.");
    }
  }
  return parsed.clusters;
}

export async function requestJson(system: string, input: unknown, model = llmConfig().model, format?: Record<string, unknown>): Promise<unknown> {
  const { url, key } = llmConfig();
  const isOllamaNative = new URL(url).pathname.replace(/\/+$/, "") === "/api/chat";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(isOllamaNative
        ? {
          model,
          stream: false,
          think: false,
          format: format ?? "json",
          options: { temperature: 0, num_predict: 2048 },
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(input) },
          ],
        }
        : {
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error("Could not reach the LLM provider. Check LLM_API_URL and start the provider.", { cause: error });
  }
  if (!response.ok) {
    throw new Error(`LLM provider returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body: unknown = await response.json();
  const content = isOllamaNative
    ? z.object({ message: z.object({ content: z.string() }) }).parse(body).message.content
    : z.object({
      choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
    }).parse(body).choices[0].message.content;
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error("The LLM returned invalid JSON.", { cause: error });
  }
}

export async function extractModelEntitiesWithPrompt(
  complaint: string,
  categories: string[],
  model: string,
  prompt: string,
): Promise<ValidatedEntity[]> {
  const output = await requestJson(prompt, { complaint: normalizeComplaintText(complaint).text, categories }, model);
  return validateExtraction(output, complaint, categories, true);
}

export async function extractModelEntities(complaint: string, categories: string[], model: string): Promise<ValidatedEntity[]> {
  return extractModelEntitiesWithPrompt(complaint, categories, model, ENTITY_EXTRACTION_PROMPT);
}

export async function proposeSynonyms(terms: LlmTerm[]) {
  const promptTerms = terms.map((term, index) => ({ ...term, id: `t${index + 1}` }));
  const originalIds = new Map(promptTerms.map((term, index) => [term.id, terms[index].id]));
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = await requestJson(SYNONYM_GROUPING_PROMPT, { terms: promptTerms, ...(feedback ? { validationError: feedback } : {}) },
      llmConfig().model, z.toJSONSchema(synonymSchema));
    try {
      return validateSynonymProposals(output, promptTerms).map((cluster) => ({
        ...cluster,
        aliases: cluster.aliases.map((id) => {
          const originalId = originalIds.get(id);
          if (!originalId) throw new Error("Validated synonym term ID could not be mapped.");
          return originalId;
        }),
      }));
    } catch (error) {
      if (error instanceof z.ZodError) {
        feedback = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      } else if (error instanceof SynonymValidationError) {
        feedback = error.message;
      } else {
        throw error;
      }
      if (attempt === 1) {
        throw new Error(`The model returned invalid synonym groups twice. No groups from this batch were saved. ${feedback}`);
      }
    }
  }
  throw new Error("Synonym validation did not complete.");
}
