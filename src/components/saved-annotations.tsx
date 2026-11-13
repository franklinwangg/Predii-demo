"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, RefreshCw, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { ConfidenceScore } from "@/components/confidence-score";
import type { Dataset, Label, LabelSchema } from "@/lib/types";

type SavedAnnotation = {
  id: string;
  exactText: string;
  startOffset: number;
  endOffset: number;
  createdBy: string;
  createdByType: "HUMAN" | "AI";
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
  confidenceTotal: number | null;
  modelConfidenceScores: Record<string, number> | null;
  occurrenceCount: number;
  document: {
    id: string;
    sourceId: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number;
    dataset: { name: string };
  };
};

type AnnotationPage = {
  annotations: SavedAnnotation[];
  total: number;
  page: number;
  limit: number;
};

export function SavedAnnotations() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [schemas, setSchemas] = useState<LabelSchema[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [datasetResult, schemaResult] = await Promise.all([
          apiRequest<{ datasets: Dataset[] }>("/api/datasets", { signal: controller.signal }),
          apiRequest<{ schemas: LabelSchema[] }>("/api/schemas", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setDatasets(datasetResult.datasets);
        setSchemas(schemaResult.schemas);
        setError("");
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load saved annotations.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reload]);

  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const visibleSchemas = selectedDataset
    ? schemas.filter((schema) => schema.id === selectedDataset.labelSchemaId)
    : schemas;

  return (
    <div className="page-wrap">
      <div className="page-heading annotations-heading">
        <div>
          <div className="eyebrow">DATA OPERATIONS <span>·</span> LABELING</div>
          <h1>Saved annotations</h1>
          <p>Browse unique saved phrases by category. Confidence shown is for the most recent occurrence, not all occurrences.</p>
        </div>
        <div className="heading-actions annotations-controls">
          <label className="select-wrap">
            <select value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label="Filter annotations by dataset">
              <option value="">All datasets</option>
              {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
            </select>
            <ChevronDown size={15} />
          </label>
          <button className="button button-secondary" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>
            <RefreshCw size={15} /> Refresh
          </button>
          <a className="button button-primary" href={`/api/annotations/export${datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : ""}`} download>
            <ArrowDownToLine size={15} /> Download accepted labels (CSV)
          </a>
        </div>
      </div>
      {loading ? (
        <div className="page-loading annotations-loading"><span className="spinner" /> Loading saved annotations…</div>
      ) : error ? (
        <div className="alert alert-error" role="alert"><CircleAlert size={18} />{error}</div>
      ) : visibleSchemas.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon"><Tags size={22} /></div>
          <h2>No labeling categories found</h2>
          <p>Seed a labeling schema to browse saved annotations.</p>
        </div>
      ) : (
        visibleSchemas.map((schema) => (
          <section className="saved-schema" key={schema.id} aria-label={`${schema.name} categories`}>
            <div className="saved-schema-heading">
              <div><div className="eyebrow">LABELING SCHEMA</div><h2>{schema.name}</h2><p>{schema.description}</p></div>
            </div>
            {schema.labels.map((label) => (
              <CategoryAnnotations key={`${label.id}-${datasetId}-${reload}`} label={label} datasetId={datasetId} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function CategoryAnnotations({ label, datasetId }: { label: Label; datasetId: string }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AnnotationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ labelId: label.id, page: String(page), limit: "20", unique: "true" });
    if (datasetId) params.set("datasetId", datasetId);
    async function load() {
      try {
        const response = await apiRequest<AnnotationPage>(`/api/annotations?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult(response);
        setError("");
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load this category.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [datasetId, label.id, page, retry]);

  function changePage(next: number) {
    setLoading(true);
    setPage(next);
  }

  return (
    <section className="saved-category" aria-label={`${label.name} annotations`}>
      <div className="saved-category-heading">
        <div className="saved-category-title">
          <span className="saved-color" style={{ backgroundColor: label.color }} />
          <h3>{label.name}</h3>
          {result && !loading && !error && <span className="count-badge">{result.total}</span>}
        </div>
        {label.description && <p>{label.description}</p>}
      </div>
      {loading ? (
        <div className="saved-category-message"><span className="spinner" /> Loading annotations…</div>
      ) : error ? (
        <div className="saved-category-message saved-category-error" role="alert">
          <CircleAlert size={15} /> {error}
          <button className="text-link" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Try again</button>
        </div>
      ) : !result?.annotations.length ? (
        <div className="saved-category-message">No saved annotations in this category.</div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="saved-table">
              <thead><tr><th>ANNOTATED PHRASE</th><th>SOURCE COMPLAINT</th><th>DATASET / VEHICLE</th><th>CREATOR / STATUS</th><th /></tr></thead>
              <tbody>
                {result.annotations.map((annotation) => (
                  <tr key={annotation.id}>
                    <td><span className="saved-phrase">{annotation.exactText}</span><small>{annotation.occurrenceCount} occurrence{annotation.occurrenceCount === 1 ? "" : "s"} · Offsets {annotation.startOffset}–{annotation.endOffset} in this complaint</small></td>
                    <td><span className="id-text">{annotation.document.sourceId}</span></td>
                    <td><span className="vehicle-cell">{annotation.document.dataset.name}</span><small>{annotation.document.vehicleYear} {annotation.document.vehicleMake} {annotation.document.vehicleModel}</small></td>
                    <td><span className="vehicle-cell">{annotation.createdBy} ({annotation.createdByType.toLowerCase()})</span><small>{annotation.status.toLowerCase()}</small>
                      {annotation.createdByType === "AI" && <ConfidenceScore total={annotation.confidenceTotal} scores={annotation.modelConfidenceScores} />}</td>
                    <td><Link className="row-action" href={`/documents/${annotation.document.id}`}>Open complaint <ArrowRight size={14} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            Showing <strong>{(page - 1) * result.limit + 1}–{Math.min(page * result.limit, result.total)}</strong> of <strong>{result.total}</strong>
            <div className="table-pagination">
              <button disabled={page <= 1} onClick={() => changePage(page - 1)} aria-label={`Previous ${label.name} page`}><ChevronLeft size={14} /></button>
              <span>{page} / {Math.max(1, Math.ceil(result.total / result.limit))}</span>
              <button disabled={page * result.limit >= result.total} onClick={() => changePage(page + 1)} aria-label={`Next ${label.name} page`}><ChevronRight size={14} /></button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
