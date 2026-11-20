import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  evaluateEntityPredictions,
  getLabeledEntities,
  type LabeledEntity,
} from "../src/lib/entity-evaluation";
import { extractModelEntitiesWithPrompt, llmConfig } from "../src/lib/llm";
import { CATEGORY_EXTRACTION_EXPERIMENTS } from "../src/lib/prompts";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

type Complaint = { id: string; text: string };
type EntityType = LabeledEntity["type"];
type GroundTruth = { components: string[]; failure_modes: string[] };
type Prediction = LabeledEntity & {
  confidence: number;
  startOffset: number;
  endOffset: number;
};
type PromptResult = {
  complaintId: string;
  predictions: Prediction[];
  inferenceMs: number;
  elapsedMs: number;
  cached: boolean;
  error?: string;
};
type CachedOutput = { predictions: Prediction[]; inferenceMs: number };
type Metrics = ReturnType<typeof evaluateEntityPredictions>;
type CategoryExtractionExperiment =
  (typeof CATEGORY_EXTRACTION_EXPERIMENTS)[keyof typeof CATEGORY_EXTRACTION_EXPERIMENTS];
type RunStats = {
  modelCalls: number;
  cachedResponses: number;
  failures: number;
  totalInferenceMs: number;
  wallElapsedMs: number;
};

const dataDirectory = path.join(process.cwd(), "data", "entity-test");
const cachePath = path.join(dataDirectory, ".entity-category-prompt-cache.json");
const model = "gemma4:e4b";
const cache = new Map<string, CachedOutput>();
let cacheWriteQueue: Promise<void> = Promise.resolve();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseRunOptions() {
  const promptIdsArgument = process.argv.find((argument) => argument.startsWith("--prompt-ids="));
  const outputFolderArgument = process.argv.find((argument) => argument.startsWith("--output-folder="));
  const promptIds = (promptIdsArgument?.slice("--prompt-ids=".length) ?? "4,5")
    .split(",")
    .map((value) => Number(value));
  const outputFolder = outputFolderArgument?.slice("--output-folder=".length) ?? "test-4";
  assert(promptIds.length === 2 && promptIds.every(Number.isSafeInteger),
    "Provide exactly two prompt IDs with --prompt-ids=<component-id>,<failure-mode-id>.");
  assert(/^test-\d+$/.test(outputFolder), "Output folder must be a test-N directory.");

  const experiments: CategoryExtractionExperiment[] = [];
  for (const id of promptIds) {
    const experiment = Object.values(CATEGORY_EXTRACTION_EXPERIMENTS).find((candidate) => candidate.id === id);
    assert(experiment, `Unknown category extraction prompt ID: ${id}.`);
    experiments.push(experiment);
  }
  assert(new Set(experiments.map((experiment) => experiment.id)).size === 2,
    "The selected prompt IDs must be different.");
  assert(new Set(experiments.map((experiment) => experiment.category)).size === 2,
    "Select one Component prompt and one Failure Mode prompt.");

  return {
    experiments,
    outputFolder,
    outputDirectory: path.join(dataDirectory, outputFolder),
  };
}

function parseComplaints(text: string): Complaint[] {
  const headers = [...text.matchAll(/^Complaint #(\d+)\r?$/gm)];
  return headers.map((header, index) => {
    const bodyStart = header.index! + header[0].length;
    const bodyEnd = headers[index + 1]?.index ?? text.length;
    return { id: header[1], text: text.slice(bodyStart, bodyEnd).trim() };
  }).filter((complaint) => complaint.text.length > 0);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cacheKey(
  complaint: Complaint,
  experiment: CategoryExtractionExperiment,
): string {
  const { url } = llmConfig();
  return hash([
    url,
    model,
    String(experiment.id),
    experiment.prompt,
    complaint.id,
    complaint.text,
  ].join("\0"));
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function saveCache(): Promise<void> {
  const temporary = `${cachePath}.tmp`;
  await writeFile(temporary, JSON.stringify(Object.fromEntries(cache), null, 2));
  await rename(temporary, cachePath);
}

function toPrediction(entity: {
  text: string;
  type: string;
  confidence: number;
  start_offset: number;
  end_offset: number;
}): Prediction {
  if (entity.type !== "Component" && entity.type !== "Failure Mode") {
    throw new Error(`Unexpected entity category: ${entity.type}`);
  }
  return {
    text: entity.text,
    type: entity.type,
    confidence: entity.confidence,
    startOffset: entity.start_offset,
    endOffset: entity.end_offset,
  };
}

function score(
  results: PromptResult[],
  labelsById: Map<string, GroundTruth>,
  category?: EntityType,
): Metrics {
  return results.reduce<Metrics>((totals, result) => {
    const predictions = category
      ? result.predictions.filter((entity) => entity.type === category)
      : result.predictions;
    const allGold = getLabeledEntities(labelsById.get(result.complaintId)!);
    const groundTruth = category ? allGold.filter((entity) => entity.type === category) : allGold;
    const current = evaluateEntityPredictions(predictions, groundTruth);
    const truePositives = totals.truePositives + current.truePositives;
    const falsePositives = totals.falsePositives + current.falsePositives;
    const falseNegatives = totals.falseNegatives + current.falseNegatives;
    const precision = truePositives / Math.max(1, truePositives + falsePositives);
    const recall = truePositives / Math.max(1, truePositives + falseNegatives);
    return {
      precision,
      recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
      truePositives,
      falsePositives,
      falseNegatives,
    };
  }, {
    precision: 0,
    recall: 0,
    f1: 0,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
  });
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? []);
}

function dice(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap++;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

function unmatched(
  predictions: LabeledEntity[],
  groundTruth: LabeledEntity[],
): { extra: LabeledEntity[]; missed: LabeledEntity[] } {
  const candidates: Array<{ predictionIndex: number; goldIndex: number; similarity: number }> = [];
  for (let predictionIndex = 0; predictionIndex < predictions.length; predictionIndex++) {
    for (let goldIndex = 0; goldIndex < groundTruth.length; goldIndex++) {
      if (predictions[predictionIndex].type !== groundTruth[goldIndex].type) continue;
      const similarity = dice(predictions[predictionIndex].text, groundTruth[goldIndex].text);
      if (similarity >= 0.5) candidates.push({ predictionIndex, goldIndex, similarity });
    }
  }
  candidates.sort((left, right) => right.similarity - left.similarity ||
    left.predictionIndex - right.predictionIndex || left.goldIndex - right.goldIndex);
  const matchedPredictions = new Set<number>();
  const matchedGold = new Set<number>();
  for (const candidate of candidates) {
    if (matchedPredictions.has(candidate.predictionIndex) || matchedGold.has(candidate.goldIndex)) continue;
    matchedPredictions.add(candidate.predictionIndex);
    matchedGold.add(candidate.goldIndex);
  }
  return {
    extra: predictions.filter((_, index) => !matchedPredictions.has(index)),
    missed: groundTruth.filter((_, index) => !matchedGold.has(index)),
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function countPredictions(results: PromptResult[], category?: EntityType): number {
  return results.reduce((total, result) => total + result.predictions.filter((entity) =>
    category ? entity.type === category : true).length, 0);
}

function countGroundTruth(labelsById: Map<string, GroundTruth>, category?: EntityType): number {
  return [...labelsById.values()].reduce((total, labels) => total +
    (category
      ? getLabeledEntities(labels).filter((entity) => entity.type === category).length
      : getLabeledEntities(labels).length), 0);
}

function errorSection(
  title: string,
  results: PromptResult[],
  labelsById: Map<string, GroundTruth>,
  category?: EntityType,
): string[] {
  const lines = [`## ${title}`, ""];
  let hasErrors = false;
  for (const result of results) {
    const predictions = category
      ? result.predictions.filter((entity) => entity.type === category)
      : result.predictions;
    const gold = getLabeledEntities(labelsById.get(result.complaintId)!);
    const expected = category ? gold.filter((entity) => entity.type === category) : gold;
    const errors = unmatched(predictions, expected);
    if (!errors.extra.length && !errors.missed.length && !result.error) continue;
    hasErrors = true;
    lines.push(`- Complaint ${result.complaintId}:`);
    if (result.error) lines.push(`  - Extraction failed: ${result.error}`);
    if (errors.extra.length) {
      lines.push(`  - Incorrect predictions: ${errors.extra.map((entity) => JSON.stringify(entity.text)).join(", ")}`);
    }
    if (errors.missed.length) {
      lines.push(`  - Missed labels: ${errors.missed.map((entity) => JSON.stringify(entity.text)).join(", ")}`);
    }
  }
  if (!hasErrors) lines.push("No unmatched predictions, missed labels, or extraction failures.");
  lines.push("");
  return lines;
}

async function main(): Promise<void> {
  const { experiments, outputFolder, outputDirectory } = parseRunOptions();
  await mkdir(outputDirectory, { recursive: true });

  try {
    const stored = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, CachedOutput>;
    for (const [key, output] of Object.entries(stored)) cache.set(key, output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const inputPaths = {
    complaints: path.join(dataDirectory, "complaint_summaries.txt"),
    labels: path.join(dataDirectory, "entity-labels.json"),
  };
  const [complaintText, groundTruthText] = await Promise.all([
    readFile(inputPaths.complaints, "utf8"),
    readFile(inputPaths.labels, "utf8"),
  ]);
  const complaints = parseComplaints(complaintText);
  const labelsById = new Map(Object.entries(JSON.parse(groundTruthText) as Record<string, GroundTruth>));
  assert(complaints.length === 30, `Expected the same 30-complaint benchmark, found ${complaints.length}.`);
  assert(complaints.length === labelsById.size, `Found ${complaints.length} complaints and ${labelsById.size} labels.`);
  for (const complaint of complaints) {
    assert(labelsById.has(complaint.id), `Missing labels for complaint ${complaint.id}.`);
  }
  await Promise.all([
    copyFile(inputPaths.complaints, path.join(outputDirectory, "complaint_summaries.txt")),
    copyFile(inputPaths.labels, path.join(outputDirectory, "entity-labels.json")),
  ]);

  const startedAt = new Date().toISOString();
  const runResults = new Map<number, PromptResult[]>();
  const runStats = new Map<number, RunStats>();

  for (const experiment of experiments) {
    const promptStarted = performance.now();
    const results: PromptResult[] = [];
    let modelCalls = 0;
    let cachedResponses = 0;

    for (const complaint of complaints) {
      const key = cacheKey(complaint, experiment);
      const cached = cache.get(key);
      if (cached) {
        cachedResponses++;
        results.push({
          complaintId: complaint.id,
          predictions: cached.predictions,
          inferenceMs: cached.inferenceMs,
          elapsedMs: 0,
          cached: true,
        });
      } else {
        modelCalls++;
        const requestStarted = performance.now();
        try {
          const entities = await extractModelEntitiesWithPrompt(
            complaint.text,
            [experiment.category],
            model,
            experiment.prompt,
          );
          const predictions = entities.map(toPrediction);
          if (predictions.some((entity) => entity.type !== experiment.category)) {
            throw new Error(`The model returned an entity outside the ${experiment.category} category.`);
          }
          const inferenceMs = performance.now() - requestStarted;
          const output = { predictions, inferenceMs };
          cache.set(key, output);
          cacheWriteQueue = cacheWriteQueue.then(saveCache);
          await cacheWriteQueue;
          results.push({
            complaintId: complaint.id,
            ...output,
            elapsedMs: inferenceMs,
            cached: false,
          });
        } catch (error) {
          const elapsedMs = performance.now() - requestStarted;
          results.push({
            complaintId: complaint.id,
            predictions: [],
            inferenceMs: elapsedMs,
            elapsedMs,
            cached: false,
            error: error instanceof Error ? error.message : "Unknown extraction error.",
          });
        }
      }
      console.log(
        `Prompt ${experiment.id}: ${experiment.name} · complaint ${complaint.id} · ${results.length}/${complaints.length}`,
      );
    }

    runResults.set(experiment.id, results);
    runStats.set(experiment.id, {
      modelCalls,
      cachedResponses,
      failures: results.filter((result) => result.error).length,
      totalInferenceMs: results.reduce((sum, result) => sum + result.inferenceMs, 0),
      wallElapsedMs: performance.now() - promptStarted,
    });
  }

  const componentExperiment = experiments.find((experiment) => experiment.category === "Component")!;
  const failureModeExperiment = experiments.find((experiment) => experiment.category === "Failure Mode")!;
  const componentResults = runResults.get(componentExperiment.id)!;
  const failureModeResults = runResults.get(failureModeExperiment.id)!;
  const combinedResults = complaints.map((complaint) => {
    const component = componentResults.find((result) => result.complaintId === complaint.id)!;
    const failureMode = failureModeResults.find((result) => result.complaintId === complaint.id)!;
    return {
      complaintId: complaint.id,
      predictions: [...component.predictions, ...failureMode.predictions],
      inferenceMs: component.inferenceMs + failureMode.inferenceMs,
      elapsedMs: component.elapsedMs + failureMode.elapsedMs,
      cached: component.cached && failureMode.cached,
      ...((component.error || failureMode.error)
        ? { error: [component.error, failureMode.error].filter(Boolean).join(" | ") }
        : {}),
    };
  });
  const combinedStats: RunStats = {
    modelCalls: experiments.reduce((sum, experiment) => sum + runStats.get(experiment.id)!.modelCalls, 0),
    cachedResponses: experiments.reduce((sum, experiment) => sum + runStats.get(experiment.id)!.cachedResponses, 0),
    failures: combinedResults.filter((result) => result.error).length,
    totalInferenceMs: combinedResults.reduce((sum, result) => sum + result.inferenceMs, 0),
    wallElapsedMs: experiments.reduce((sum, experiment) => sum + runStats.get(experiment.id)!.wallElapsedMs, 0),
  };

  const toLabelFormat = (results: PromptResult[], category: EntityType) => Object.fromEntries(
    results.map((result) => [result.complaintId, {
      components: category === "Component"
        ? result.predictions.map((entity) => entity.text.toLocaleLowerCase("en"))
        : [],
      failure_modes: category === "Failure Mode"
        ? result.predictions.map((entity) => entity.text.toLocaleLowerCase("en"))
        : [],
    }]),
  );
  const componentLabels = toLabelFormat(componentResults, "Component");
  const failureModeLabels = toLabelFormat(failureModeResults, "Failure Mode");
  const combinedLabels = Object.fromEntries(complaints.map(({ id }) => [id, {
    components: componentLabels[id].components,
    failure_modes: failureModeLabels[id].failure_modes,
  }]));
  const toConfidenceFormat = (results: PromptResult[]) => Object.fromEntries(
    results.map((result) => [result.complaintId, {
      entities: result.predictions.map(({ text, type, confidence }) => ({ text, type, confidence })),
    }]),
  );
  const componentConfidence = toConfidenceFormat(componentResults);
  const failureModeConfidence = toConfidenceFormat(failureModeResults);
  const combinedConfidence = toConfidenceFormat(combinedResults);
  const detailedResults = {
    model,
    inputs: ["complaint_summaries.txt", "entity-labels.json"],
    evaluationMethod: "Per-complaint one-to-one, category-aware token Dice matching at 0.50; micro-averaged.",
    outputEntityTextCase: "lowercase in label-format files; exact complaint casing in detailed predictions.",
    prompts: experiments.map((experiment) => ({
      id: experiment.id,
      name: experiment.name,
      category: experiment.category,
      sha256: hash(experiment.prompt),
    })),
    complaints: complaints.map((complaint) => ({
      complaintId: complaint.id,
      text: complaint.text,
      groundTruth: labelsById.get(complaint.id),
      componentExtraction: componentResults.find((result) => result.complaintId === complaint.id),
      failureModeExtraction: failureModeResults.find((result) => result.complaintId === complaint.id),
      combinedPredictions: combinedResults.find((result) => result.complaintId === complaint.id)?.predictions ?? [],
    })),
  };
  await Promise.all([
    writeFile(
      path.join(outputDirectory, `component-extraction-prompt-${componentExperiment.id}.txt`),
      componentExperiment.prompt,
    ),
    writeFile(
      path.join(outputDirectory, `failure-mode-extraction-prompt-${failureModeExperiment.id}.txt`),
      failureModeExperiment.prompt,
    ),
    writeFile(path.join(outputDirectory, "component-extractions.json"), JSON.stringify(componentLabels, null, 2)),
    writeFile(path.join(outputDirectory, "failure-mode-extractions.json"), JSON.stringify(failureModeLabels, null, 2)),
    writeFile(path.join(outputDirectory, "combined-entity-label-format.json"), JSON.stringify(combinedLabels, null, 2)),
    writeFile(path.join(outputDirectory, "component-extractions-with-confidence.json"),
      JSON.stringify(componentConfidence, null, 2)),
    writeFile(path.join(outputDirectory, "failure-mode-extractions-with-confidence.json"),
      JSON.stringify(failureModeConfidence, null, 2)),
    writeFile(path.join(outputDirectory, "combined-entities-with-confidence.json"),
      JSON.stringify(combinedConfidence, null, 2)),
    writeFile(path.join(outputDirectory, "detailed_results.json"), JSON.stringify(detailedResults, null, 2)),
  ]);

  const outputRows: Array<{
    experiment: string;
    category: string;
    metrics: Metrics;
    stats: RunStats;
  }> = [];
  const promptPair = experiments.map((experiment) => experiment.id).sort((left, right) => left - right).join("+");
  const combinedExperimentName = `Combined split-prompt pipeline (Prompts ${promptPair})`;
  for (const experiment of experiments) {
    const results = runResults.get(experiment.id)!;
    outputRows.push({
      experiment: `Prompt ${experiment.id}: ${experiment.name}`,
      category: experiment.category,
      metrics: score(results, labelsById, experiment.category),
      stats: runStats.get(experiment.id)!,
    });
  }
  outputRows.push(
    {
      experiment: combinedExperimentName,
      category: "Overall",
      metrics: score(combinedResults, labelsById),
      stats: combinedStats,
    },
    {
      experiment: combinedExperimentName,
      category: "Component",
      metrics: score(combinedResults, labelsById, "Component"),
      stats: combinedStats,
    },
    {
      experiment: combinedExperimentName,
      category: "Failure Mode",
      metrics: score(combinedResults, labelsById, "Failure Mode"),
      stats: combinedStats,
    },
  );

  const csvHeaders = [
    "experiment",
    "category",
    "model",
    "complaints",
    "precision",
    "recall",
    "f1",
    "true_positives",
    "false_positives",
    "false_negatives",
    "failed_complaints",
    "model_calls",
    "cached_responses",
    "average_model_seconds_per_complaint",
    "total_model_seconds",
    "wall_runtime_seconds",
  ];
  const csvRows = outputRows.map(({ experiment, category, metrics, stats }) => [
    experiment,
    category,
    model,
    complaints.length,
    metrics.precision,
    metrics.recall,
    metrics.f1,
    metrics.truePositives,
    metrics.falsePositives,
    metrics.falseNegatives,
    stats.failures,
    stats.modelCalls,
    stats.cachedResponses,
    stats.totalInferenceMs / Math.max(1, complaints.length) / 1000,
    stats.totalInferenceMs / 1000,
    stats.wallElapsedMs / 1000,
  ]);
  await writeFile(
    path.join(outputDirectory, "summary.csv"),
    `${csvHeaders.map(csvCell).join(",")}\n${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
  );

  const entityMetricRows = [
    {
      label: "Components",
      results: componentResults,
      category: "Component" as const,
      metrics: score(componentResults, labelsById, "Component"),
      stats: runStats.get(componentExperiment.id)!,
    },
    {
      label: "Failure Modes",
      results: failureModeResults,
      category: "Failure Mode" as const,
      metrics: score(failureModeResults, labelsById, "Failure Mode"),
      stats: runStats.get(failureModeExperiment.id)!,
    },
    {
      label: "Overall",
      results: combinedResults,
      category: undefined,
      metrics: score(combinedResults, labelsById),
      stats: combinedStats,
    },
  ];
  const entityMetricsCsvHeaders = [
    "category",
    "complaints",
    "ground_truth_entities",
    "predicted_entities",
    "precision",
    "recall",
    "f1",
    "true_positives",
    "false_positives",
    "false_negatives",
    "failed_complaints",
  ];
  const entityMetricsCsvRows = entityMetricRows.map(({ label, results, category, metrics, stats }) => [
    label,
    complaints.length,
    countGroundTruth(labelsById, category),
    countPredictions(results, category),
    metrics.precision,
    metrics.recall,
    metrics.f1,
    metrics.truePositives,
    metrics.falsePositives,
    metrics.falseNegatives,
    stats.failures,
  ]);
  await writeFile(
    path.join(outputDirectory, "gemma4-entity-metrics.csv"),
    `${entityMetricsCsvHeaders.map(csvCell).join(",")}\n` +
      `${entityMetricsCsvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
  );
  const entityMetricReportRows = entityMetricRows.map(({ results, category, metrics }) =>
    `| ${complaints.length} | ${countGroundTruth(labelsById, category)} | ${countPredictions(results, category)} | ` +
    `${percent(metrics.precision)} | ${percent(metrics.recall)} | ${percent(metrics.f1)} | ` +
    `${metrics.truePositives} | ${metrics.falsePositives} | ${metrics.falseNegatives} |`);
  const componentFailed = runResults.get(componentExperiment.id)!.filter((result) => result.error).length;
  const failureModeFailed = runResults.get(failureModeExperiment.id)!.filter((result) => result.error).length;
  const componentFailureIds = new Set(runResults.get(componentExperiment.id)!
    .filter((result) => result.error).map((result) => result.complaintId));
  const failureModeFailureIds = runResults.get(failureModeExperiment.id)!
    .filter((result) => result.error).map((result) => result.complaintId);
  const overlappingFailures = failureModeFailureIds.filter((id) => componentFailureIds.has(id)).length;
  const entityMetricsReport = [
    `# Prompts ${promptPair} Gemma ${outputFolder} metrics`,
    "",
    `Gemma 4 run against ${complaints.length} complaints using the separate component and failure-mode prompts. Metrics use one-to-one matching within each complaint, category-aware token Dice >= 0.50, micro-averaged. Confidence does not filter predictions.`,
    "",
    `Unresolved extraction failures: ${combinedStats.failures} unique complaints (${componentFailed} component failures and ${failureModeFailed} failure-mode failures, with ${overlappingFailures} overlapping). Failed category extractions contribute no predictions, so their ground-truth entities count as false negatives.`,
    "",
    "## Components",
    "",
    "| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    entityMetricReportRows[0],
    "",
    "## Failure Modes",
    "",
    "| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    entityMetricReportRows[1],
    "",
    "## Overall",
    "",
    "| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    entityMetricReportRows[2],
    "",
  ].join("\n");
  await writeFile(path.join(outputDirectory, "gemma4-entity-metrics.md"), entityMetricsReport);

  const reportRows = outputRows.map(({ experiment, category, metrics, stats }) =>
    `| ${experiment} | ${category} | ${percent(metrics.precision)} | ${percent(metrics.recall)} | ${percent(metrics.f1)} | ` +
    `${metrics.truePositives}/${metrics.falsePositives}/${metrics.falseNegatives} | ${stats.failures} | ${stats.modelCalls} | ` +
    `${(stats.totalInferenceMs / Math.max(1, complaints.length) / 1000).toFixed(2)} | ${(stats.wallElapsedMs / 1000).toFixed(2)} |`);
  const report = [
    "# Split component and failure-mode prompt experiment",
    "",
    `Model: ${model}. Dataset: ${complaints.length} complaints.`,
    "",
    `Prompt ${componentExperiment.id} (${componentExperiment.name}) extracts Components only; Prompt ${failureModeExperiment.id} (${failureModeExperiment.name}) extracts Failure Modes only. The combined rows measure one pipeline that runs both prompts for every complaint.`,
    "",
    "## Results",
    "",
    "| Experiment | Metric category | Precision | Recall | F1 | TP/FP/FN | Failed complaints | Model calls | Avg. model seconds/complaint | Wall runtime (seconds) |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...reportRows,
    "",
    "## Evaluation and runtime notes",
    "",
    "Metrics use the existing one-to-one, category-aware token Dice matcher at a 0.50 threshold within each complaint, micro-averaged across the dataset. Confidence does not filter predictions. Confidence-bearing JSON files retain each entity's score. An extraction failure returns no predictions for that complaint, so matching labels count as false negatives.",
    "",
    "Average model time is the sum of recorded inference durations divided by the complaint count. Wall runtime measures each experiment's elapsed time in this run. Cached responses retain their original model inference duration; cache hits do not count as new model calls.",
    "",
  ].join("\n");
  await writeFile(path.join(outputDirectory, "benchmark_report.md"), report);

  const errorAnalysis = [
    "# Split-prompt error analysis",
    "",
    "Unmatched items use the same category-aware token Dice threshold (0.50) and one-to-one matching as the benchmark metrics.",
    "",
    ...errorSection(`Prompt ${componentExperiment.id}: component predictions`, componentResults, labelsById, "Component"),
    ...errorSection(`Prompt ${failureModeExperiment.id}: failure-mode predictions`, failureModeResults, labelsById, "Failure Mode"),
    ...errorSection("Combined split-prompt pipeline", combinedResults, labelsById),
  ].join("\n");
  await writeFile(path.join(outputDirectory, "error_analysis.md"), errorAnalysis);

  const metadata = {
    model,
    promptIds: experiments.map((experiment) => experiment.id),
    complaintCount: complaints.length,
    inputs: ["complaint_summaries.txt", "entity-labels.json"],
    inputSha256: {
      complaints: hash(complaintText),
      labels: hash(groundTruthText),
    },
    evaluationMethod: "Per-complaint one-to-one, category-aware token Dice matching at 0.50; micro-averaged.",
    outputEntityTextCase: "lowercase in label-format files; exact complaint casing and confidence scores in confidence-bearing files",
    startedAt,
    completedAt: new Date().toISOString(),
    experiments: Object.fromEntries(experiments.map((experiment) => {
      const stats = runStats.get(experiment.id)!;
      return [String(experiment.id), {
        name: experiment.name,
        category: experiment.category,
        promptSha256: hash(experiment.prompt),
        modelCalls: stats.modelCalls,
        cachedResponses: stats.cachedResponses,
        failedComplaints: runResults.get(experiment.id)!.filter((result) => result.error)
          .map(({ complaintId, error }) => ({ complaintId, error })),
        metrics: score(runResults.get(experiment.id)!, labelsById, experiment.category),
        totalModelSeconds: stats.totalInferenceMs / 1000,
        wallRuntimeSeconds: stats.wallElapsedMs / 1000,
      }];
    })),
    combined: {
      modelCalls: combinedStats.modelCalls,
      cachedResponses: combinedStats.cachedResponses,
      failedComplaints: combinedResults.filter((result) => result.error)
        .map(({ complaintId, error }) => ({ complaintId, error })),
      overall: score(combinedResults, labelsById),
      components: score(combinedResults, labelsById, "Component"),
      failureModes: score(combinedResults, labelsById, "Failure Mode"),
      totalModelSeconds: combinedStats.totalInferenceMs / 1000,
      wallRuntimeSeconds: combinedStats.wallElapsedMs / 1000,
    },
  };
  await writeFile(path.join(outputDirectory, "run-metadata.json"), JSON.stringify(metadata, null, 2));

  console.table(outputRows.map(({ experiment, category, metrics, stats }) => ({
    experiment,
    category,
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    truePositives: metrics.truePositives,
    falsePositives: metrics.falsePositives,
    falseNegatives: metrics.falseNegatives,
    failedComplaints: stats.failures,
    modelCalls: stats.modelCalls,
  })));
  console.log(`Saved split-prompt benchmark results to ${outputDirectory}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
