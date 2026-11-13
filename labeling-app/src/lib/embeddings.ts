import { createHash } from "node:crypto";
import { normalizeTerm } from "@/lib/synonym-logic";

export type EmbeddingInput = {
  text: string;
  entityType: string;
};

export type CachedEmbeddingInput = EmbeddingInput & {
  normalizedText: string;
  embedding: number[] | null;
};

export type GeneratedEmbedding = {
  entityType: string;
  normalizedText: string;
  embedding: number[];
};

type EmbeddingResponse = {
  data?: Array<{ index: number; embedding: number[] }>;
  error?: { message?: string };
};

const BATCH_SIZE = 64;
const MAX_ATTEMPTS = 3;
const MODEL = process.env.EMBEDDING_MODEL || "nomic-embed-text";
const ENDPOINT = process.env.EMBEDDING_API_URL || "http://127.0.0.1:11434/v1/embeddings";

export function embeddingModelName(): string {
  return MODEL;
}

export function embeddingCacheKey(): string {
  const endpointHash = createHash("sha256").update(ENDPOINT).digest("hex").slice(0, 12);
  return `${MODEL}:${endpointHash}`;
}

export async function embedTerms(
  inputs: EmbeddingInput[],
  fetcher: typeof fetch = fetch,
): Promise<GeneratedEmbedding[]> {
  const unique = new Map<string, EmbeddingInput>();
  for (const input of inputs) {
    const normalizedText = normalizeTerm(input.text);
    const key = `${input.entityType}\u0000${normalizedText}`;
    if (normalizedText && !unique.has(key)) unique.set(key, input);
  }
  const entries = [...unique.entries()];
  const generated: GeneratedEmbedding[] = [];

  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const inputTexts = batch.map(([, item]) =>
      `Automotive entity type: ${item.entityType}. Term: ${item.text}`,
    );
    const embeddings = await requestEmbeddings(inputTexts, fetcher);
    batch.forEach(([key, item], index) => {
      generated.push({
        entityType: item.entityType,
        normalizedText: key.slice(key.indexOf("\u0000") + 1),
        embedding: embeddings[index],
      });
    });
  }
  return generated;
}

export async function generateMissingEmbeddings(
  terms: CachedEmbeddingInput[],
  embedder: (inputs: EmbeddingInput[]) => Promise<GeneratedEmbedding[]> = embedTerms,
): Promise<Map<string, number[]>> {
  const missing = new Map<string, EmbeddingInput>();
  for (const term of terms) {
    if (term.embedding === null) {
      const key = `${term.entityType}\u0000${term.normalizedText}`;
      if (!missing.has(key)) missing.set(key, { text: term.text, entityType: term.entityType });
    }
  }
  const generated = await embedder([...missing.values()]);
  const byNormalizedText = new Map<string, number[]>();
  for (const result of generated) {
    byNormalizedText.set(`${result.entityType}\u0000${result.normalizedText}`, result.embedding);
  }
  return byNormalizedText;
}

async function requestEmbeddings(inputs: string[], fetcher: typeof fetch): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EMBEDDING_API_KEY
            ? { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({ model: MODEL, input: inputs }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const detail = await response.text();
        const error = new Error(`Embedding provider returned ${response.status}: ${detail.slice(0, 500)}`);
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } else {
        const body = (await response.json()) as EmbeddingResponse;
        if (!Array.isArray(body.data) || body.data.length !== inputs.length) {
          throw new Error(body.error?.message ?? "Embedding provider returned an incomplete batch.");
        }
        const ordered = [...body.data].sort((left, right) => left.index - right.index);
        const dimension = ordered[0]?.embedding.length;
        if (
          !dimension ||
          ordered.some(({ embedding }) =>
            embedding.length !== dimension || embedding.some((value) => !Number.isFinite(value)),
          )
        ) {
          throw new Error("Embedding provider returned invalid vectors.");
        }
        return ordered.map(({ embedding }) => embedding);
      }
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith("Embedding provider returned 4")) {
        throw error;
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(
    `Could not generate embeddings after ${MAX_ATTEMPTS} attempts. Check EMBEDDING_API_URL, EMBEDDING_MODEL, and provider availability.`,
    { cause: lastError },
  );
}
