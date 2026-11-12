"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  Filter,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiRequest } from "@/lib/client-api";
import type { Dataset, DocumentSummary } from "@/lib/types";

type StatusFilter = "ALL" | "LABELED" | "UNLABELED";
const PAGE_SIZE = 30;

const statusNames: Record<DocumentSummary["labelingStatus"], string> = {
  LABELED: "Labeled",
  UNLABELED: "Unlabeled",
  IN_PROGRESS: "In progress",
};

export function Dashboard() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId);

  const refreshDocuments = useCallback(async (
    datasetId: string,
    pageNumber: number,
    status: StatusFilter,
    query: string,
  ) => {
    const params = new URLSearchParams({
      datasetId,
      page: String(pageNumber),
      limit: String(PAGE_SIZE),
      status,
    });
    if (query.trim()) params.set("q", query.trim());
    const result = await apiRequest<{ documents: DocumentSummary[]; total: number }>(
      `/api/documents?${params.toString()}`,
    );
    setError("");
    setDocuments(result.documents);
    setDocumentTotal(result.total);
  }, []);

  const loadDashboard = useCallback(async (preferredId?: string) => {
    setError("");
    try {
      const result = await apiRequest<{ datasets: Dataset[] }>("/api/datasets");
      setDatasets(result.datasets);
      const selectedId =
        preferredId ??
        result.datasets[0]?.id ??
        "";
      setActiveDatasetId(selectedId);
      setPage(1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load datasets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadDashboard());
  }, [loadDashboard]);

  useEffect(() => {
    if (!activeDatasetId) return;
    const timer = window.setTimeout(() => {
      void refreshDocuments(activeDatasetId, page, filter, search).catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load documents.");
      });
    }, search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [activeDatasetId, filter, page, refreshDocuments, search]);

  function changeDataset(datasetId: string) {
    setActiveDatasetId(datasetId);
    setPage(1);
    setDocuments([]);
    setDocumentTotal(0);
    setError("");
  }

  async function loadNextBatch() {
    if (!activeDataset) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{
        imported: number;
        availableFromSource: number;
        exhausted: boolean;
      }>(`/api/datasets/${activeDataset.id}/ingest`, { method: "POST" });
      setNotice(
        result.imported > 0
          ? `Added ${result.imported} complaints.`
          : "No new complaints are available to import.",
      );
      await loadDashboard(activeDataset.id);
      await refreshDocuments(activeDataset.id, 1, filter, search);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Complaint import failed.");
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <div className="page-loading"><span className="spinner" /> Loading workspace…</div>;
  }

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATA OPERATIONS <span>·</span> NHTSA</div>
          <h1>Datasets</h1>
          <p>Manage imported vehicle complaints and annotation progress.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New dataset
          </button>
          <button className="button button-primary" onClick={loadNextBatch} disabled={!activeDataset || importing}>
            {importing ? <RefreshCw className="spin" size={16} /> : <ArrowDownToLine size={16} />}
            {importing ? "Loading complaints…" : "Load Next 30 Complaints"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error"><CircleAlert size={18} /> <span>{error}</span></div>}
      {notice && <div className="alert alert-success"><Check size={18} /> <span>{notice}</span></div>}

      {datasets.length > 0 && (
        <>
          <div className="dataset-selector">
            <div className="dataset-selector-icon"><FileText size={18} /></div>
            <div className="dataset-selector-copy">
              <span>ACTIVE DATASET</span>
              <strong>{activeDataset?.name}</strong>
            </div>
            <label className="select-wrap">
              <select value={activeDatasetId} onChange={(event) => void changeDataset(event.target.value)} aria-label="Select dataset">
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
          </div>

          {activeDataset && (
            <>
              <div className="vehicle-line">
                <span className="source-chip"><span className="source-dot" /> {activeDataset.source} COMPLAINTS</span>
                <span>{activeDataset.vehicleMake} {activeDataset.vehicleModel} <b>·</b> {activeDataset.vehicleYear}</span>
                <span className="line-separator" />
                <span>Schema: <strong>{activeDataset.labelSchema.name}</strong></span>
              </div>
              <div className="stats-grid">
                <StatCard label="Total complaints" value={activeDataset.totalDocuments} sub="Imported documents" icon={<FileText size={17} />} />
                <StatCard label="Labeled" value={activeDataset.labeledDocuments} sub={completion(activeDataset)} accent="green" icon={<Check size={17} />} />
                <StatCard label="Unlabeled" value={activeDataset.unlabeledDocuments} sub="Ready for review" accent="orange" icon={<ClipboardIcon />} />
                <StatCard label="Annotations" value={activeDataset.annotationCount} sub="Entity spans created" accent="purple" icon={<Sparkles size={17} />} />
              </div>
              <div className="progress-card">
                <div className="progress-heading">
                  <div><strong>Labeling progress</strong><span> {activeDataset.labeledDocuments} of {activeDataset.totalDocuments} complaints completed</span></div>
                  <b>{completion(activeDataset)}</b>
                </div>
                <div className="progress-track"><div style={{ width: completion(activeDataset) }} /></div>
              </div>
            </>
          )}

          <section className="table-card">
            <div className="table-heading">
              <div><h2>Imported complaints</h2><p>Review and annotate original NHTSA reports.</p></div>
              <div className="table-tools">
                <label className="search-field">
                  <Search size={16} />
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search complaints" />
                </label>
                <label className="filter-field">
                  <Filter size={15} />
                  <select value={filter} onChange={(event) => { setFilter(event.target.value as StatusFilter); setPage(1); }} aria-label="Filter by labeling status">
                    <option value="ALL">All status</option>
                    <option value="UNLABELED">Unlabeled</option>
                    <option value="LABELED">Labeled</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button className="icon-button" onClick={() => {
                  void loadDashboard(activeDatasetId);
                }} aria-label="Refresh data">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            {documents.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>COMPLAINT ID</th><th>VEHICLE</th><th>COMPLAINT</th><th>ANNOTATIONS</th><th>STATUS</th><th /></tr></thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td><span className="id-text">ODI-{document.sourceId}</span></td>
                        <td><span className="vehicle-cell">{document.vehicleMake} {document.vehicleModel}</span><small>{document.vehicleYear}</small></td>
                        <td className="preview-cell" title={document.originalText}>{document.originalText || <i>No complaint text provided.</i>}</td>
                        <td><span className="annotation-count">{document.annotationCount}</span></td>
                        <td><span className={`status-pill status-${document.labelingStatus.toLowerCase().replace("_", "-")}`}><span />{statusNames[document.labelingStatus]}</span></td>
                        <td><Link className="row-action" href={`/documents/${document.id}`}>Open <ArrowRight size={14} /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-table">
                <div className="empty-icon"><FileText size={21} /></div>
                <strong>{documentTotal === 0 && filter === "ALL" && !search ? "No complaints imported yet" : "No matching complaints"}</strong>
                <p>{documentTotal === 0 && filter === "ALL" && !search ? "Load the first batch of NHTSA complaints to begin labeling." : "Try another search or status filter."}</p>
                {documentTotal === 0 && filter === "ALL" && !search && <button className="button button-primary" onClick={loadNextBatch} disabled={importing}><ArrowDownToLine size={16} /> Load Next 30 Complaints</button>}
              </div>
            )}
            {documents.length > 0 && (
              <div className="table-footer">
                Showing <strong>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, documentTotal)}</strong> of <strong>{documentTotal}</strong> complaints
                <span>·</span> Records imported from NHTSA
                <div className="table-pagination">
                  <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
                  <span>{page} / {Math.max(1, Math.ceil(documentTotal / PAGE_SIZE))}</span>
                  <button disabled={page >= Math.ceil(documentTotal / PAGE_SIZE)} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </section>
          <div className="dashboard-footnote"><Sparkles size={14} /> Complaints are unverified owner reports and should not be treated as confirmed diagnoses.</div>
        </>
      )}
      {!datasets.length && !error && (
        <div className="empty-state-card">
          <div className="empty-icon"><Layers3 size={22} /></div>
          <h2>No datasets yet</h2>
          <p>Create a dataset to start importing NHTSA complaints.</p>
          <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Create a dataset</button>
        </div>
      )}
      {showCreate && <CreateDatasetModal onClose={() => setShowCreate(false)} onCreated={async (id) => {
        setShowCreate(false);
        await loadDashboard(id);
      }} />}
    </div>
  );
}

function StatCard({ label, value, sub, accent = "blue", icon }: {
  label: string;
  value: number;
  sub: string;
  accent?: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top"><span>{label}</span><span className={`stat-icon icon-${accent}`}>{icon}</span></div>
      <div className="stat-value">{value.toLocaleString()}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function completion(dataset: Dataset) {
  if (!dataset.totalDocuments) return "0%";
  return `${Math.round((dataset.labeledDocuments / dataset.totalDocuments) * 100)}%`;
}

function ClipboardIcon() {
  return <Filter size={17} />;
}

function CreateDatasetModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("Toyota Prius 2005 Complaints");
  const [make, setMake] = useState("Toyota");
  const [model, setModel] = useState("Prius");
  const [year, setYear] = useState("2005");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest<{ dataset: { id: string } }>("/api/datasets", {
        method: "POST",
        body: JSON.stringify({ name, source: "NHTSA", vehicleMake: make, vehicleModel: model, vehicleYear: Number(year) }),
      });
      await onCreated(result.dataset.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create dataset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-head"><div><div className="eyebrow">DATASET SETUP</div><h2 id="create-title">Create a dataset</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div>
        <p className="modal-copy">Connect a vehicle query to the NHTSA complaints source.</p>
        {error && <div className="alert alert-error"><CircleAlert size={17} />{error}</div>}
        <form onSubmit={submit} className="form-grid">
          <label className="form-span">Dataset name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Vehicle make<input required value={make} onChange={(event) => setMake(event.target.value)} /></label>
          <label>Model year<input required type="number" min="1949" max={new Date().getFullYear() + 2} value={year} onChange={(event) => setYear(event.target.value)} /></label>
          <label className="form-span">Vehicle model<input required value={model} onChange={(event) => setModel(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Creating…" : "Create dataset"} <ArrowRight size={15} /></button></div>
        </form>
      </div>
    </div>
  );
}
