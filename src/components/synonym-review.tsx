"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, GitMerge, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";

type EntityOption = { id: string; canonicalName: string; label: { name: string } };
type TermMember = {
  termId: string;
  similarityScore: number;
  annotationCount: number;
  complaintCount: number;
  term: {
    id: string;
    text: string;
    normalizedText: string;
    alias: { entity: { id: string; canonicalName: string } } | null;
  };
};
type Cluster = {
  id: string;
  status: "PENDING" | "DEFERRED" | "APPROVED" | "REJECTED";
  priorityScore: number;
  label: { id: string; name: string };
  suggestedEntity: { id: string; canonicalName: string } | null;
  resolvedEntity: { id: string; canonicalName: string } | null;
  reviewer: string | null;
  llmStatus: string | null;
  llmCanonicalName: string | null;
  llmExplanation: string | null;
  llmModel: string | null;
  members: TermMember[];
};
type ClusterPage = { clusters: Cluster[]; total: number; page: number; limit: number };
type EntityPage = { entities: EntityOption[] };

function suggestedCanonicalName(cluster: Cluster): string {
  return cluster.llmCanonicalName || ([...cluster.members].sort(
    (left, right) => right.annotationCount - left.annotationCount || left.term.text.localeCompare(right.term.text),
  )[0]?.term.text ?? "");
}

export function SynonymReview() {
  const [status, setStatus] = useState<"PENDING" | "DEFERRED">("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ClusterPage | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  const [reviewer, setReviewer] = useState("local-labeler");
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [canonicalName, setCanonicalName] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [entityId, setEntityId] = useState("");
  const [moveTerms, setMoveTerms] = useState<string[]>([]);
  const [targetClusterId, setTargetClusterId] = useState("");

  const selected = result?.clusters.find((cluster) => cluster.id === selectedId) ?? null;
  const proposedName = useMemo(() => selected ? suggestedCanonicalName(selected) : "", [selected]);

  const loadClusters = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ status, page: String(page), limit: "50" });
    return apiRequest<ClusterPage>(`/api/synonyms/clusters?${params}`, { signal });
  }, [status, page]);

  useEffect(() => {
    const controller = new AbortController();
    void loadClusters(controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (!page.clusters.length && page.total > 0 && page.page > Math.ceil(page.total / page.limit)) {
          setPage(Math.ceil(page.total / page.limit));
          return;
        }
        setResult(page);
        const currentId = selectedIdRef.current;
        const nextId = page.clusters.some((cluster) => cluster.id === currentId)
          ? currentId
          : page.clusters[0]?.id ?? "";
        selectedIdRef.current = nextId;
        setSelectedId(nextId);
        if (nextId !== currentId) {
          setCanonicalName(null);
          setEntityId("");
          setDescription("");
          setEntitySearch("");
          setEntityOptions([]);
          setMoveTerms([]);
          setTargetClusterId("");
        }
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load synonym clusters.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadClusters, reload]);

  const selectedLabelId = selected?.label.id;
  useEffect(() => {
    if (!selectedLabelId || entitySearch.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        labelId: selectedLabelId,
        q: entitySearch.trim(),
        limit: "10",
      });
      void apiRequest<EntityPage>(`/api/entities?${params}`, { signal: controller.signal })
        .then((response) => setEntityOptions(response.entities))
        .catch((searchError: unknown) => {
          if (!controller.signal.aborted) {
            setError(searchError instanceof Error ? searchError.message : "Could not search canonical entities.");
          }
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [entitySearch, selectedLabelId]);

  function chooseCluster(cluster: Cluster) {
    selectedIdRef.current = cluster.id;
    setSelectedId(cluster.id);
    setEntityId("");
    setCanonicalName(suggestedCanonicalName(cluster));
    setDescription("");
    setEntitySearch("");
    setEntityOptions([]);
  }

  function changePage(nextPage: number) {
    setLoading(true);
    setCanonicalName(null);
    setEntityId("");
    setDescription("");
    setPage(nextPage);
  }

  async function discover() {
    setDiscovering(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{
        created: number;
        examinedTerms: number;
        model: string;
        hasMoreTerms: boolean;
      }>("/api/synonyms/discover", { method: "POST" });
      setNotice(
        `Created ${response.created} candidate cluster${response.created === 1 ? "" : "s"} from ${response.examinedTerms} terms using ${response.model}.${response.hasMoreTerms ? " Run discovery again for remaining batches." : ""}`,
      );
      setLoading(true);
      setReload((value) => value + 1);
    } catch (discoverError) {
      setError(discoverError instanceof Error ? discoverError.message : "Could not discover synonym candidates.");
    } finally {
      setDiscovering(false);
    }
  }

  async function decide(action: "merge" | "reject" | "defer") {
    if (!selected) return;
    if (!reviewer.trim()) {
      setError("Enter the reviewer name before saving this decision.");
      return;
    }
    const resolvedCanonicalName = canonicalName === null ? proposedName : canonicalName.trim();
    if (action === "merge" && !resolvedCanonicalName) {
      setError("Enter a canonical name before merging.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (action === "merge") {
        await apiRequest(`/api/synonyms/clusters/${selected.id}/merge`, {
          method: "POST",
          body: JSON.stringify({
            canonicalName: resolvedCanonicalName,
            ...(entityId ? { entityId } : {}),
            description: description.trim() || undefined,
            reviewer,
          }),
        });
        setNotice(`Merged ${selected.members.length} term${selected.members.length === 1 ? "" : "s"} as “${resolvedCanonicalName}”.`);
      } else {
        await apiRequest(`/api/synonyms/clusters/${selected.id}/${action}`, {
          method: "POST",
          body: JSON.stringify({ reviewer }),
        });
        setNotice(action === "reject" ? "Cluster rejected; this term combination will not be suggested again." : "Cluster deferred for later review.");
      }
      setLoading(true);
      setReload((value) => value + 1);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Could not save this review decision.");
    } finally {
      setSaving(false);
    }
  }

  function chooseEntity(entity: EntityOption) {
    setEntityId(entity.id);
    setCanonicalName(entity.canonicalName);
    setEntitySearch("");
    setEntityOptions([]);
  }

  async function moveSelectedTerms() {
    if (!selected || !targetClusterId || !moveTerms.length || !reviewer.trim()) {
      setError("Select terms, a target group, and a reviewer.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/synonyms/clusters/${selected.id}/move`, {
        method: "POST",
        body: JSON.stringify({ targetClusterId, termIds: moveTerms, reviewer }),
      });
      setMoveTerms([]);
      setTargetClusterId("");
      setNotice("Terms moved; both groups require review.");
      setLoading(true);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not move terms.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-heading synonym-heading">
        <div>
          <div className="eyebrow">DATA OPERATIONS <span>·</span> VOCABULARY</div>
          <h1>Synonym review</h1>
          <p>Review LLM proposals using complaint context. No group is merged without human approval.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-primary" disabled={discovering} onClick={() => void discover()}>
            {discovering ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
            {discovering ? "Discovering…" : "Run discovery"}
          </button>
          <button className="button button-secondary" disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1); }}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert"><CircleAlert size={18} />{error}</div>}
      {notice && <div className="alert alert-success" role="status"><Check size={17} />{notice}</div>}

      <div className="synonym-toolbar">
        <div className="synonym-tabs" role="tablist" aria-label="Review status">
          <button className={status === "PENDING" ? "active" : ""} onClick={() => { if (status !== "PENDING") { setLoading(true); setPage(1); setEntityId(""); setCanonicalName(null); setStatus("PENDING"); } }}>Needs review</button>
          <button className={status === "DEFERRED" ? "active" : ""} onClick={() => { if (status !== "DEFERRED") { setLoading(true); setPage(1); setEntityId(""); setCanonicalName(null); setStatus("DEFERRED"); } }}>Review later</button>
        </div>
        <span>{result?.total ?? 0} cluster{result?.total === 1 ? "" : "s"} · ordered by review priority</span>
      </div>

      {loading ? (
        <div className="page-loading"><span className="spinner" /> Loading synonym clusters…</div>
      ) : !result?.clusters.length ? (
        <div className="empty-state-card synonym-empty">
          <div className="empty-icon"><GitMerge size={22} /></div>
          <h2>{status === "PENDING" ? "No clusters need review" : "No deferred clusters"}</h2>
          <p>{status === "PENDING" ? "Run discovery to compare annotated terms, or keep labeling to grow the vocabulary." : "Clusters you defer will stay available here."}</p>
        </div>
      ) : (
        <div className="synonym-layout">
          <aside className="synonym-list" aria-label="Synonym clusters">
            {result.clusters.map((cluster) => (
              <button
                key={cluster.id}
                className={`synonym-list-item ${cluster.id === selectedId ? "selected" : ""}`}
                onClick={() => chooseCluster(cluster)}
              >
                <span className="synonym-item-top"><strong>{cluster.members.map(({ term }) => term.text).join(" · ")}</strong><b>{Math.round(cluster.priorityScore * 100)}</b></span>
                <span>{cluster.label.name} · {cluster.members.reduce((sum, member) => sum + member.annotationCount, 0)} annotations</span>
                {cluster.suggestedEntity && <small>Possible match: {cluster.suggestedEntity.canonicalName}</small>}
              </button>
            ))}
            <div className="synonym-pagination">
            <button disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
            <span>Page {page} of {Math.max(1, Math.ceil((result.total ?? 0) / result.limit))}</span>
            <button disabled={page >= Math.ceil((result.total ?? 0) / result.limit)} onClick={() => changePage(page + 1)}>Next</button>
            </div>
          </aside>

          {selected && (
            <section className="synonym-detail" aria-label="Selected synonym cluster">
              <div className="synonym-detail-heading">
                <div>
                  <div className="eyebrow">CANDIDATE CLUSTER</div>
                  <h2>{selected.members.length} terms <span>·</span> {selected.label.name}</h2>
                  <p>{selected.llmStatus ? `LLM: ${selected.llmStatus.replace("_", " ")} · ${selected.llmModel}` : "Previously generated candidate"} — confirm that these phrases name the same entity.</p>
                  {selected.llmExplanation && <p>{selected.llmExplanation}</p>}
                </div>
                <div className="synonym-priority"><strong>{Math.round(selected.priorityScore * 100)}</strong><small>PRIORITY</small></div>
              </div>

              {selected.suggestedEntity && (
                <div className="synonym-suggestion">
                  <Sparkles size={15} /> Similar to existing entity <strong>{selected.suggestedEntity.canonicalName}</strong>
                  <button className="text-button" onClick={() => chooseEntity({
                    ...selected.suggestedEntity!,
                    label: { name: selected.label.name },
                  })}>Use entity</button>
                </div>
              )}

              <div className="synonym-terms">
                <div className="synonym-term-header"><span>OBSERVED TERM</span><span>{selected.llmStatus ? "MOVE" : "SIMILARITY"}</span><span>ANNOTATIONS</span><span>COMPLAINTS</span></div>
                {selected.members.map((member) => (
                  <div className="synonym-term-row" key={member.termId}>
                    <span><strong>{member.term.text}</strong>{member.term.alias && <small>Resolved to {member.term.alias.entity.canonicalName}</small>}</span>
                    <span>{selected.llmStatus ? <input type="checkbox" aria-label={`Select ${member.term.text} to move`} checked={moveTerms.includes(member.termId)} onChange={(event) => setMoveTerms((current) => event.target.checked ? [...current, member.termId] : current.filter((id) => id !== member.termId))} /> : `${(member.similarityScore * 100).toFixed(1)}%`}</span>
                    <span>{member.annotationCount.toLocaleString()}</span>
                    <span>{member.complaintCount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {selected.llmStatus && <div className="synonym-actions">
                <label className="select-wrap">Move selected to
                  <select value={targetClusterId} onChange={(event) => setTargetClusterId(event.target.value)} aria-label="Target group">
                    <option value="">Select a group on this page</option>
                    {result.clusters.filter((cluster) => cluster.id !== selected.id && cluster.label.id === selected.label.id).map((cluster) =>
                      <option key={cluster.id} value={cluster.id}>{cluster.members.map(({ term }) => term.text).join(" · ")}</option>,
                    )}
                  </select>
                </label>
                <button className="button button-secondary" disabled={saving} onClick={() => void moveSelectedTerms()}>Move terms</button>
              </div>}

              <div className="synonym-merge-form">
                <div className="eyebrow">CANONICAL ENTITY</div>
                {entityId ? (
                  <div className="selected-entity">
                    <span><Check size={15} /> Existing entity: <strong>{canonicalName}</strong></span>
                    <button aria-label="Clear selected entity" onClick={() => { setEntityId(""); setCanonicalName(proposedName); }}><X size={15} /></button>
                  </div>
                ) : (
                  <>
                    <label className="synonym-field">
                      Canonical name
                      <input value={canonicalName ?? proposedName} onChange={(event) => setCanonicalName(event.target.value)} maxLength={160} />
                    </label>
                    <div className="synonym-name-suggestions">
                      <span>Choose an observed name:</span>
                      {selected.members.map(({ term }) => (
                        <button key={term.id} onClick={() => { setEntityId(""); setCanonicalName(term.text); }}>{term.text}</button>
                      ))}
                    </div>
                    <label className="synonym-field synonym-search">
                      <span><Search size={14} /> Search existing canonical entities</span>
                      <input value={entitySearch} onChange={(event) => { setEntitySearch(event.target.value); setEntityOptions([]); }} placeholder="Type at least two characters…" />
                    </label>
                    {entityOptions.length > 0 && (
                      <div className="synonym-entity-options">
                        {entityOptions.map((entity) => (
                          <button key={entity.id} onClick={() => chooseEntity(entity)}>
                            <strong>{entity.canonicalName}</strong><small>{entity.label.name}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <label className="synonym-field">
                  Decision note (optional)
                  <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Why these terms are synonymous…" />
                </label>
                <label className="synonym-field">
                  Reviewer
                  <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} maxLength={120} />
                </label>
              </div>

              <div className="synonym-actions">
                <button className="button button-primary" disabled={saving} onClick={() => void decide("merge")}><GitMerge size={15} /> Merge terms</button>
                <button className="button button-secondary" disabled={saving} onClick={() => void decide("reject")}><X size={15} /> Keep separate</button>
                <button className="button button-secondary" disabled={saving} onClick={() => void decide("defer")}>Review later</button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
