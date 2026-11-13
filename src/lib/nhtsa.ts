import { HttpError } from "@/lib/http";

const COMPLAINTS_URL = "https://api.nhtsa.gov/complaints/complaintsByVehicle";

export type NhtsaComplaint = Record<string, unknown> & {
  odiNumber?: string | number;
  summary?: string;
  products?: unknown;
};

export async function fetchComplaints(
  make: string,
  model: string,
  year: number,
): Promise<NhtsaComplaint[]> {
  const url = new URL(COMPLAINTS_URL);
  url.search = new URLSearchParams({
    make,
    model,
    modelYear: String(year),
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "Predii automotive labeling MVP" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new HttpError(
      error instanceof Error ? `NHTSA request failed: ${error.message}` : "NHTSA request failed.",
      502,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HttpError("NHTSA returned a response that was not valid JSON.", 502);
  }

  if (!response.ok && response.status !== 400) {
    throw new HttpError(`NHTSA returned HTTP ${response.status}.`, 502);
  }
  if (!body || typeof body !== "object" || !("results" in body)) {
    throw new HttpError("NHTSA response did not contain a results field.", 502);
  }

  const results = (body as { results: unknown }).results;
  if (!Array.isArray(results)) {
    throw new HttpError("NHTSA returned malformed complaints data.", 502);
  }
  if (response.status === 400 && results.length > 0) {
    throw new HttpError("NHTSA returned an unexpected HTTP 400 response.", 502);
  }

  return results.filter(
    (record): record is NhtsaComplaint =>
      typeof record === "object" && record !== null && !Array.isArray(record),
  );
}

export function complaintSourceId(record: NhtsaComplaint): string | null {
  const value = record.odiNumber;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  return id.length > 0 ? id : null;
}

export function nextUnimportedComplaints(
  records: NhtsaComplaint[],
  importedIds: Set<string>,
  limit = 30,
): NhtsaComplaint[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const seen = new Set(importedIds);
  const next: NhtsaComplaint[] = [];
  for (const record of records) {
    const sourceId = complaintSourceId(record);
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);
    next.push(record);
    if (next.length === limit) break;
  }
  return next;
}

export function complaintVehicle(
  record: NhtsaComplaint,
  fallback: { make: string; model: string; year: number },
) {
  const products = Array.isArray(record.products) ? record.products : [];
  const selected = products.find(
    (product) =>
      typeof product === "object" &&
      product !== null &&
      String((product as Record<string, unknown>).productMake ?? "").toLowerCase() === fallback.make.toLowerCase() &&
      String((product as Record<string, unknown>).productModel ?? "").toLowerCase() === fallback.model.toLowerCase() &&
      Number((product as Record<string, unknown>).productYear) === fallback.year,
  );
  const product =
    selected && typeof selected === "object"
      ? (selected as Record<string, unknown>)
      : {};

  return {
    make: stringOrFallback(product.productMake, fallback.make),
    model: stringOrFallback(product.productModel, fallback.model),
    year: numberOrFallback(product.productYear, fallback.year),
  };
}

export function complaintText(record: NhtsaComplaint): string {
  return typeof record.summary === "string" ? record.summary : "";
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
