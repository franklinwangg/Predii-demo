# Predii Automotive Data Labeling

A Next.js App Router application for importing NHTSA complaints, reviewing source text,
and saving offset-accurate automotive entity annotations in PostgreSQL.

The existing Python collector remains in `../entity-extraction`; this app is an independent
web application and does not replace its file-based output.

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
it with `npm run db:local:start`.

The application currently needs no NHTSA API key. The initial import calls the public
`complaintsByVehicle` endpoint.

## Install and run

From `labeling-app/`:

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

The seed command creates the `Automotive Entity Recognition` schema, its eight labels, and
the default Toyota Prius 2005 complaints dataset. Seed operations are repeatable.

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
- The server validates that each span matches the original text at those offsets before saving.
- Draft annotations remain visible while editing and navigation is disabled until they are
  submitted or discarded. Submitted spans are stored in a transaction.
- Existing annotations can be recategorized or deleted; category and document progress update
  through the API.
- Overlapping spans are rendered as one continuous source string with combined visual styling.
- Stopword de-emphasis affects presentation only; text and offsets remain unchanged. Negation
  terms such as “no”, “not”, and “without” are intentionally not de-emphasized.

## API routes

- `GET/POST /api/datasets`
- `POST /api/datasets/[id]/ingest`
- `GET /api/documents?datasetId=...&status=ALL|LABELED|UNLABELED`
- `GET /api/documents/[id]`
- `GET/POST /api/documents/[id]/annotations`
- `PATCH/DELETE /api/annotations/[id]`
- `GET /api/schemas`

Business and database operations live in `src/lib/data.ts`; request validation is in
`src/lib/validation.ts`. Human and AI annotation creators and proposed/accepted/rejected
statuses are represented in the database, but AI annotation generation is not part of this MVP.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```
