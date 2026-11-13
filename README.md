# Predii Automotive Knowledge Extraction

A Next.js App Router application for importing NHTSA complaints, extracting automotive
mentions with an LLM, and reviewing confidence-scored mentions and synonym groups in PostgreSQL.

## Requirements

- Node.js 20.9 or newer (Node 24 recommended)
- PostgreSQL 14 or newer
- npm

## Configure PostgreSQL

Create a database, for example:

```sql
CREATE DATABASE predii_labeling;
```

In this directory, copy `.env.example` to `.env` and set `DATABASE_URL` to a PostgreSQL
connection string. Example for a local PostgreSQL server:

```text
DATABASE_URL="postgresql://postgres:your-password@localhost:5432/predii_labeling?schema=public"
```

For local development without a separately installed PostgreSQL server, Prisma 7 can run a
local PostgreSQL-compatible development database:

```bash
npx prisma dev --name predii-labeling
```

Use the direct `DATABASE_URL` printed by Prisma in `.env` (the `postgres://...` URL, not
the `prisma+postgres://...` proxy URL; this app uses Prisma's PostgreSQL driver adapter).
Leave the Prisma dev database running while using the app. After its first creation, restart
it with `npm run db:local:start`. If the local development database encounters concurrent
query errors, set `DATABASE_POOL_MAX=1` in `.env.local` and restart the app. This limits
each application process to one database connection; leave it unset for normal PostgreSQL
pool defaults.

The application currently needs no NHTSA API key. The initial import calls the public
`complaintsByVehicle` endpoint.

## Install and run

From the repository root:

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `db:deploy` applies the checked-in
initial migration; use `npm run db:migrate -- --name your_change` when changing the schema
locally. To create a new development migration, PostgreSQL must be running and reachable.

The seed command creates the `Automotive Entity Recognition` schema and the default Toyota Prius
2005 complaints dataset. It preserves the existing labels and adds Component, Manufacturer,
Symptom, and Failure Mode. Seed operations are repeatable.

The migration replacing the original categories deletes annotations assigned to the removed
Manufacturer, Vehicle Model, Failure Mode, Vehicle Indicator, and Other categories. It marks
affected documents with no remaining annotations as unlabeled. Back up any existing
annotations before deploying the migration if they need to be retained.

The subsequent category expansion deletes existing Repair Status annotations and removes
the Repair Status and Repair Facility categories. Documents left with no annotations are
marked unlabeled. It refuses to run if Repair Facility has annotations or if the schema
has custom categories; review those manually before proceeding. Back up data before deploying.

The category consolidation migration preserves annotations and maps Component and Vehicle
System to Automotive Part / System; Manufacturer to Organization; Symptom, Failure Mode,
Warning Indicator, and Safety Event to Problem; and Diagnostic/Repair Term to Repair /
Diagnosis. Vehicle and Organization remain unchanged. Identical spans from different old
categories remain separate annotations. The migration stops if custom categories are present.

For production, set `DATABASE_URL`, run `npm run db:deploy`, then `npm run build` and
`npm run start`.

## Ingestion behavior

The NHTSA complaints-by-vehicle endpoint returns the full result set and does not provide
supported pagination. Each “Load Next 30 Complaints” request fetches that result set, filters
out complaint IDs already stored for the dataset, and inserts up to 30 new complaints.
The `(datasetId, sourceId)` unique constraint and `createMany(skipDuplicates)` prevent
duplicate imports without overwriting existing documents or annotations. The original source
payload and complaint text are preserved.

If PostgreSQL is not configured, API calls return an error and the dashboard displays it;
database-dependent functionality has not run until migrations and seed complete successfully.

## Annotation workflow

- Select arbitrary complaint text; start offsets are inclusive and end offsets exclusive.
- Focus the complaint text (click it or use Tab), then use the left and right arrow keys
  to select words. Hold Shift while using the arrows to extend or shrink the selection.
  Keyboard navigation starts at the clicked position, or at the first or last word when
  no text position is selected.
- With a phrase selected, press the key shown in the legend (1–5 for the default schema) to add a
  draft immediately and clear the selection. Shortcuts are disabled in form fields; submit
  drafts to save them.
- Alternatively, select text and click a category in the legend to add a draft.
- The server validates that each span matches the original text at those offsets before saving.
- Draft annotations remain visible while editing and navigation is disabled until they are
  submitted or discarded. Submitted spans are stored in a transaction.
- Existing annotations can be recategorized or deleted; category and document progress update
  through the API.
- Open **Saved annotations** in the sidebar to browse submitted phrases grouped by category.
  Exact, case-sensitive duplicates appear once per category, with an occurrence count and a
  link to the most recent matching complaint. Filtering by dataset applies before grouping.
  All original annotations remain available on their source complaints.
- Open **Synonym review** to discover candidate automotive vocabulary and review it manually.
  Annotated terms are normalized for lookup while their original text and offsets remain unchanged.
  Merging links the selected terms and their existing annotations to a canonical entity; future
  annotations using an approved alias are linked automatically.
- Open **Entity review** to see extracted mentions grouped into confident (8–10) and unconfident
  (1–7) labels. Unconfident mentions can be corrected and accepted or rejected. Repeated exact
  phrases in the same category and confidence group are shown once with an occurrence count.
- Overlapping spans are rendered as one continuous source string with combined visual styling.
- Stopword de-emphasis affects presentation only; text and offsets remain unchanged. Negation
  terms such as “no”, “not”, and “without” are intentionally not de-emphasized.

## API routes

- `GET/POST /api/datasets`
- `POST /api/datasets/[id]/ingest`
- `GET /api/documents?datasetId=...&status=ALL|LABELED|UNLABELED`
- `GET /api/documents/[id]`
- `GET/POST /api/documents/[id]/annotations`
- `GET /api/annotations?labelId=...&datasetId=...&page=1&limit=20`
- `GET /api/annotations?labelId=...&unique=true` returns paginated distinct phrases and occurrence counts.
- `PATCH/DELETE /api/annotations/[id]`
- `GET /api/schemas`
- `POST /api/pipeline/extract` with `{ "datasetId": "...", "phase": "select" }` selects up to three unscored complaints. Subsequent requests provide those `documentIds`, a model name or `compare` as `phase`, and an optional `limit` (maximum 3) and `excludedDocumentIds`.
- `GET /api/pipeline/stats?datasetId=...`
- `GET /api/entity-review?page=1`
- `POST /api/entity-review/[id]`
- `GET /api/synonyms/clusters?status=PENDING&page=1&limit=20`
- `GET /api/synonyms/clusters/[id]`
- `POST /api/synonyms/clusters/[id]/merge`
- `POST /api/synonyms/clusters/[id]/reject`
- `POST /api/synonyms/clusters/[id]/defer`
- `POST /api/synonyms/clusters/[id]/move`
- `POST /api/synonyms/discover`
- `GET/POST /api/entities`
- `GET /api/entities/[id]`

The existing Annotation model represents an entity mention and stores each model's 1–10 score
plus the three-model total out of 30. Totals of 25 or higher are high confidence; lower totals
require human review. AutomotiveEntity represents a canonical entity. ExtractionRun tracks the
models, attempts, failures, and completed work.
ReviewDecision records human decisions and the original and corrected span when a mention is
reviewed. The original LLM output is stored alongside each extracted mention. Existing
annotations and canonical entities are preserved.

## LLM extraction and synonym resolution

The default provider is Ollama's local chat API, with model thinking disabled so extraction
returns the requested structured output directly. Install and start Ollama, then download the
three entity extraction models:

```bash
ollama pull qwen3.5:4b
ollama pull gemma4:e4b
ollama pull granite4:3b
```

Set these variables in `.env` to use another compatible endpoint. Entity extraction always uses
the three models above; `LLM_MODEL` configures the separate synonym-resolution model:

```text
LLM_API_URL="http://127.0.0.1:11434/api/chat"
LLM_MODEL="qwen2.5:7b"
LLM_API_KEY=""
```

The selected endpoint receives complaint text and representative complaint sentences. Use only a
provider authorized to process this data. The provider must support JSON response format. The app
validates categories and UTF-16 offsets. Complaints sent for entity extraction are lowercased and
whitespace runs are collapsed; the stored complaint is not changed. Returned phrases are matched
case-insensitively with normalized whitespace and mapped back to exact original text and offsets.
Missing or invalid offsets are derived from all matching occurrences. Confidence values expressed
on a 0–1 scale are converted to the nearest 1–10 integer. If the returned phrase does not occur
even after normalization, the model's attempt fails explicitly and can be retried; normalization
cannot repair invented or paraphrased entities. Previously saved valid model outputs are reused.
Completed extraction runs are cached by document, endpoint, model, and pipeline
version. The app runs each model across the selected complaints in turn, persists its validated output,
and compares results after all three model passes finish. A complaint is scored only when all
three model outputs are available; failed model calls can be retried without rerunning successful
models. For each
exact-span/category candidate, scores from models that return that candidate are summed; a model
that does not return it contributes zero. Category disagreements are scored separately, so a
candidate must receive at least 25/30 for automatic acceptance. Failed attempts are retried;
abandoned processing leases expire after 15 minutes. Existing human decisions are preserved.
The **Score up to 3 complaints (3 models)** dashboard action selects at most three complaints in
the selected dataset not yet scored by this ensemble. All model and comparison phases use the same
selection, including complaints with previously cached model outputs. Failed complaints are reported
while the remaining selected documents continue; run the action again for the next batch or to retry
failed work. Mentions from earlier single-model runs
remain visible as unscored and require human review until ensemble scoring is run.
The entity review and complaint annotation views show each saved ensemble total and model vote.
The complaint annotation panel separates high-confidence, low-confidence, unscored AI, and
human or draft annotations.
On **Saved annotations**, use **Download accepted labels (CSV)** to export every accepted
annotation occurrence, either across all datasets or for the selected dataset. Proposed and
rejected labels are excluded. The CSV includes complaint ID, category, offsets, creator, total
confidence, and each model's vote. A zero vote means no matching proposal; blank values mean
no score is recorded. Spreadsheet formula-like text is prefixed with an apostrophe for safety.
Alternatively, **Download entity list (CSV)** exports one `entity : category` field per distinct
accepted phrase and category, ignoring capitalization when deduplicating. It uses the same dataset
filter, preserves the first observed spelling, and excludes proposed and rejected labels.
Repeated AI mentions of the same phrase and category within a complaint appear once with an
occurrence count. A single accept, reject, or category decision in Entity review applies to all
matching pending occurrences; already reviewed or automatically accepted mentions are not changed.
Accepting an unchanged phrase also adds human-reviewed annotations for other matching occurrences
that did not already have an annotation in the selected category; existing decisions are preserved.
Text or offset corrections apply only to the selected occurrence. When occurrences have different
scores, the group appears in the lowest confidence section and keeps each occurrence's score.
Known canonical entities and approved aliases in the same category are crossed out and marked
as known; low-confidence and unscored matches still require human review.
Zero means the model did not propose the same exact span and category, not that it assigned a
zero confidence score. Unscored older annotations have no ensemble total. On the saved annotations
page, confidence belongs to the displayed most recent occurrence, not every occurrence of the phrase.
Changing an annotation's category or correcting its text or offsets clears its old ensemble score.
The dashboard reports the current model or comparison phase and its progress after each
complaint finishes, with error details for failures. Keep the dashboard open while a scoring pass is
running; leaving the page stops scheduling further complaints. Completed results remain saved, and
running the action again retries the remaining and failed complaints.

To use the workflow:

1. Apply migrations with `npm run db:deploy`.
2. Configure and start the LLM provider, then import complaints on the dashboard.
3. Use **Score up to 3 complaints (3 models)**, repeating as needed for remaining complaints.
4. Open **Entity review** to see high-confidence, low-confidence, and unscored labels in separate
   sections; correct and accept or reject mentions needing review.
5. Run synonym resolution repeatedly. It sends batches of up to 40 accepted terms of one category,
   with representative complaint sentences, to the LLM. Completed identical batches are cached.
   Ollama receives a structured response schema; invalid proposals are retried once and are never saved
   unless they pass validation.
6. Open **Synonym review** to inspect explanations, move terms between visible groups of the same
   category, choose or create a canonical entity, and approve, reject, or defer a group.

Merge operations run in a database transaction. Approved aliases automatically link future
accepted annotations of the same normalized term to their canonical entity. No LLM synonym
proposal is merged without human approval. Rejecting records pairwise associations without
deleting terms or annotations. The app does not currently provide an undo button for an approved
merge. Existing embedding-generated clusters remain available for review; new discovery uses
the LLM rather than embeddings.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
