import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  evaluateEntityPredictions,
  getLabeledEntities,
  type LabeledEntity,
} from "../src/lib/entity-evaluation";
import { ENTITY_MODELS, extractModelEntities, llmConfig } from "../src/lib/llm";
import { ACTIVE_ENTITY_EXTRACTION_PROMPT_ID, ENTITY_EXTRACTION_PROMPT } from "../src/lib/prompts";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

type Complaint = { id: string; text: string };
type GroundTruth = {
  complaint_id: string;
  components: string[];
  failure_modes: string[];
};
type CachedOutput = { predictions: LabeledEntity[]; inferenceMs: number };
type ModelResult = {
  model: string;
  complaintId: string;
  predictions: LabeledEntity[];
  inferenceMs: number;
  cached: boolean;
  error?: string;
};

const dataDirectory = path.join(process.cwd(), "data");
const cachePath = path.join(dataDirectory, ".entity-model-evaluation-cache.json");
const summaryPath = path.join(dataDirectory, "entity-model-metrics.csv");
const categories = ["Component", "Failure Mode"];
const cache = new Map<string, CachedOutput>();
let cacheWriteQueue: Promise<void> = Promise.resolve();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseComplaints(text: string): Complaint[] {
  const headers = [...text.matchAll(/^Complaint #(\d+)\r?$/gm)];
  return headers.map((header, index) => {
    const bodyStart = header.index! + header[0].length;
    const bodyEnd = headers[index + 1]?.index ?? text.length;
    return { id: header[1], text: text.slice(bodyStart, bodyEnd).trim() };
  }).filter((complaint) => complaint.text.length > 0);
}

function cacheKey(complaint: Complaint, model: string): string {
  const { url } = llmConfig();
  return createHash("sha256")
    .update(`${url}\0${model}\0${ACTIVE_ENTITY_EXTRACTION_PROMPT_ID}\0${ENTITY_EXTRACTION_PROMPT}\0${complaint.id}\0${complaint.text}`)
    .digest("hex");
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function saveCache(): Promise<void> {
  const temporary = `${cachePath}.tmp`;
  await writeFile(temporary, JSON.stringify(Object.fromEntries(cache), null, 2));
  await rename(temporary, cachePath);
}

async function runLimited<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await work(items[index]);
    }
  }));
}

async function main(): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  try {
    const stored = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, CachedOutput>;
    for (const [key, output] of Object.entries(stored)) cache.set(key, output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const [complaintText, groundTruthText] = await Promise.all([
    readFile(path.join(dataDirectory, "complaint_summaries.txt"), "utf8"),
    readFile(path.join(dataDirectory, "entity-labels.json"), "utf8"),
  ]);
  const complaints = parseComplaints(complaintText);
  const labels = (JSON.parse(groundTruthText) as { complaints: GroundTruth[] }).complaints;
  const labelsById = new Map(labels.map((label) => [label.complaint_id, label]));
  assert(complaints.length === labels.length, `Found ${complaints.length} complaints and ${labels.length} labels.`);
  for (const complaint of complaints) assert(labelsById.has(complaint.id), `Missing labels for complaint ${complaint.id}.`);

  const jobs = ENTITY_MODELS.flatMap((model) => complaints.map((complaint) => ({ model, complaint })));
  const results: ModelResult[] = [];
  let completed = 0;
  await runLimited(jobs, ENTITY_MODELS.length, async ({ model, complaint }) => {
    const key = cacheKey(complaint, model);
    const cached = cache.get(key);
    if (cached) {
      results.push({
        model,
        complaintId: complaint.id,
        predictions: cached.predictions,
        inferenceMs: cached.inferenceMs,
        cached: true,
      });
    } else {
      const started = performance.now();
      try {
        const entities = await extractModelEntities(complaint.text, categories, model);
        const predictions: LabeledEntity[] = entities.map(({ text, type }) => {
          if (type !== "Component" && type !== "Failure Mode") {
            throw new Error(`Unexpected entity category: ${type}`);
          }
          return { text, type };
        });
        const output = {
          predictions,
          inferenceMs: performance.now() - started,
        };
        cache.set(key, output);
        cacheWriteQueue = cacheWriteQueue.then(saveCache);
        await cacheWriteQueue;
        results.push({ model, complaintId: complaint.id, ...output, cached: false });
      } catch (error) {
        results.push({
          model,
          complaintId: complaint.id,
          predictions: [],
          inferenceMs: performance.now() - started,
          cached: false,
          error: error instanceof Error ? error.message : "Unknown extraction error.",
        });
      }
    }
    completed++;
    console.log(`Completed ${completed}/${jobs.length}: ${model} · complaint ${complaint.id}`);
  });

  const rows = ENTITY_MODELS.map((model) => {
    const modelResults = results.filter((result) => result.model === model);
    const totals = modelResults.reduce((sum, result) => {
      const labelsForComplaint = labelsById.get(result.complaintId)!;
      const metrics = evaluateEntityPredictions(
        result.predictions,
        getLabeledEntities(labelsForComplaint),
      );
      return {
        truePositives: sum.truePositives + metrics.truePositives,
        falsePositives: sum.falsePositives + metrics.falsePositives,
        falseNegatives: sum.falseNegatives + metrics.falseNegatives,
      };
    }, { truePositives: 0, falsePositives: 0, falseNegatives: 0 });
    const precision = totals.truePositives / Math.max(1, totals.truePositives + totals.falsePositives);
    const recall = totals.truePositives / Math.max(1, totals.truePositives + totals.falseNegatives);
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    const failures = modelResults.filter((result) => result.error);
    return {
      model,
      complaints: complaints.length,
      precision,
      recall,
      f1,
      true_positives: totals.truePositives,
      false_positives: totals.falsePositives,
      false_negatives: totals.falseNegatives,
      failed_complaints: failures.length,
      failure_details: JSON.stringify(failures.map(({ complaintId, error }) => ({ complaintId, error }))),
      average_inference_seconds: modelResults.reduce((sum, result) => sum + result.inferenceMs, 0) /
        Math.max(1, modelResults.length) / 1000,
    };
  });
  const header = Object.keys(rows[0]);
  const csv = `${header.map(csvCell).join(",")}\n${rows.map((row) =>
    header.map((key) => csvCell(row[key as keyof typeof row])).join(",")).join("\n")}\n`;
  await writeFile(summaryPath, csv);

  console.table(rows.map(({ model, precision, recall, f1, true_positives, false_positives, false_negatives, failed_complaints }) => ({
    model, precision, recall, f1, true_positives, false_positives, false_negatives, failed_complaints,
  })));
  console.log(`Matching: one-to-one token Dice >= 0.50 within the same category.`);
  console.log(`Saved standalone model metrics to ${summaryPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
