"use client";

import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { ConfidenceScore } from "@/components/confidence-score";
import { findPhraseOccurrences, groupMentions } from "@/lib/mention-groups";

type Label = { id: string; name: string };
type Mention = {
  id: string;
  exactText: string;
  startOffset: number;
  endOffset: number;
  labelId: string;
  createdBy: string;
  status: "PROPOSED" | "ACCEPTED";
  confidenceTotal: number | null;
  modelConfidenceScores: Record<string, number> | null;
  label: Label;
  knownEntity: string | null;
};
type ReviewPage = {
  total: number;
  document: {
    id: string;
    sourceId: string;
    originalText: string;
    annotations: Mention[];
    dataset: { labelSchema: { labels: Label[] } };
  } | null;
};

export function EntityReview() {
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<ReviewPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<ReviewPage>(`/api/entity-review?page=${page}`, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.document && response.total > 0 && page > response.total) {
          setPage(response.total);
          return;
        }
        setResult(response);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load entity reviews.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, reload]);

  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }

  return <div className="page-wrap">
    <div className="page-heading">
      <div><div className="eyebrow">DATA OPERATIONS · ENTITY EXTRACTION</div><h1>Entity review</h1>
        <p>Labels are grouped by their three-model confidence total. Totals of 25/30 or higher are high confidence; lower totals need human review.</p></div>
      <button className="button button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh scores</button>
    </div>
    {error && <div className="alert alert-error" role="alert"><CircleAlert size={18} />{error}</div>}
    {loading ? <div className="page-loading"><span className="spinner" /> Loading reviews…</div>
      : !result?.document ? <div className="empty-state-card"><h2>No extracted entities to review</h2><p>Run AI extraction to populate the confidence sections.</p></div>
      : <>
        <div className="synonym-toolbar">
          <strong>Complaint {result.document.sourceId}</strong>
          <span>{page} of {result.total} complaints with extracted labels</span>
          <div className="heading-actions">
            <button className="button button-secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button>
            <button className="button button-secondary" disabled={page >= result.total} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button>
          </div>
        </div>
        <div className="synonym-detail">
          <h2>Original complaint</h2>
          <p className="entity-review-text">{result.document.originalText}</p>
        </div>
        <ConfidenceSection
          title="High confidence"
          description="Total scores of 25–30 out of 30"
          groups={groupMentions(result.document.annotations).filter((group) => group.level === "high")}
          originalText={result.document.originalText}
        />
        <ConfidenceSection
          title="Low confidence"
          description="Total scores below 25 out of 30; human review required"
          groups={groupMentions(result.document.annotations).filter((group) => group.level === "low")}
          labels={result.document.dataset.labelSchema.labels}
          originalText={result.document.originalText}
          onReviewed={refresh}
        />
        <ConfidenceSection
          title="Not scored"
          description="Older labels without an ensemble score; human review required"
          groups={groupMentions(result.document.annotations).filter((group) => group.level === "unscored")}
          labels={result.document.dataset.labelSchema.labels}
          originalText={result.document.originalText}
          onReviewed={refresh}
        />
      </>}
  </div>;
}

function ConfidenceSection({ title, description, groups, labels, originalText, onReviewed }: {
  title: string;
  description: string;
  groups: ReturnType<typeof groupMentions<Mention>>;
  labels?: Label[];
  originalText?: string;
  onReviewed?: () => void;
}) {
  return <section className="confidence-section">
    <div className="confidence-section-heading">
      <div><h2>{title}</h2><p>{description}</p></div>
      <span>{groups.reduce((count, group) => count + group.mentions.length, 0)} labels</span>
    </div>
    {groups.length === 0
      ? <div className="empty-state-card"><p>No labels in this confidence group.</p></div>
      : <div className="confidence-groups">
        {groups.map((group) => <article className="confidence-group" key={`${group.mentions[0].labelId}:${group.mentions[0].exactText}`}>
          <div className="confidence-group-heading">
            <strong className={group.mentions.some((mention) => mention.knownEntity) ? "known-entity-text" : ""}>{group.mentions[0].exactText}{originalText && findPhraseOccurrences(originalText, group.mentions[0].exactText).length > 1 && <span className="entity-count">x{findPhraseOccurrences(originalText, group.mentions[0].exactText).length}</span>}</strong>
            <span>{group.mentions[0].label.name}</span>
            {group.mentions.some((mention) => mention.knownEntity) && <span className="known-entity-badge">Known entity: {group.mentions.find((mention) => mention.knownEntity)?.knownEntity}</span>}
          </div>
          {group.mentions.map((mention, index) => <div key={mention.id}>
            {group.mentions.length > 1 && <span className="confidence-occurrence">Occurrence {index + 1}</span>}
            <ConfidenceScore total={mention.confidenceTotal} scores={mention.modelConfidenceScores} />
          </div>)}
          <details className="mention-occurrences">
            <summary>Occurrence details</summary>
            {group.mentions.map((mention, index) => <div className="mention-occurrence" key={mention.id}>
              <div className="eyebrow">OCCURRENCE {index + 1} · {mention.confidenceTotal === null ? "NOT SCORED" : `${mention.confidenceTotal}/30`} · OFFSETS {mention.startOffset}–{mention.endOffset}</div>
            </div>)}
          </details>
          {labels && originalText && onReviewed && group.mentions.some((mention) => mention.status === "PROPOSED") && <MentionReview
            mention={group.mentions.find((mention) => mention.status === "PROPOSED")!}
            occurrences={group.mentions.filter((mention) => mention.status === "PROPOSED")}
            labels={labels}
            originalText={originalText}
            onReviewed={onReviewed}
          />}
        </article>)}
      </div>}
  </section>;
}

function MentionReview({ mention, occurrences, labels, originalText, onReviewed }: {
  mention: Mention;
  occurrences: Mention[];
  labels: Label[];
  originalText: string;
  onReviewed: () => void;
}) {
  const [text, setText] = useState(mention.exactText);
  const [start, setStart] = useState(String(mention.startOffset));
  const [end, setEnd] = useState(String(mention.endOffset));
  const [labelId, setLabelId] = useState(mention.labelId);
  const [reviewer, setReviewer] = useState("local-labeler");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "accept" | "reject") {
    const startOffset = Number(start);
    const endOffset = Number(end);
    if (!reviewer.trim() || !Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) ||
        startOffset < 0 || endOffset <= startOffset || originalText.slice(startOffset, endOffset) !== text) {
      setError("Enter a reviewer and ensure text exactly matches the specified complaint offsets.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/entity-review/${mention.id}`, {
        method: "POST",
        body: JSON.stringify({ action, reviewer, exactText: text, startOffset, endOffset, labelId,
          applyAllOccurrences: text === mention.exactText && startOffset === mention.startOffset && endOffset === mention.endOffset,
          occurrenceIds: text === mention.exactText && startOffset === mention.startOffset && endOffset === mention.endOffset
            ? occurrences.map((item) => item.id) : [mention.id] }),
      });
      onReviewed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this decision.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="entity-review-fields-wrap">
    <div className="eyebrow">AI ENSEMBLE · {mention.createdBy} · {mention.confidenceTotal === null ? "NOT SCORED" : `${mention.confidenceTotal}/30`}</div>
    {findPhraseOccurrences(originalText, mention.exactText).length > 1 && <p>Decisions apply to all {occurrences.length} pending occurrences. Accepting also labels other matching occurrences; existing decisions are preserved. Text or offset corrections apply only to this occurrence.</p>}
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <div className="entity-review-fields">
      <label className="synonym-field">Exact text<input value={text} onChange={(event) => setText(event.target.value)} /></label>
      <label className="synonym-field">Start offset<input type="number" min="0" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label className="synonym-field">End offset<input type="number" min="1" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      <label className="synonym-field">Category<select value={labelId} onChange={(event) => setLabelId(event.target.value)}>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
      <label className="synonym-field">Reviewer<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
    </div>
    <div className="synonym-actions">
      <button className="button button-primary" disabled={saving} onClick={() => void decide("accept")}>Accept</button>
      <button className="button button-secondary" disabled={saving} onClick={() => void decide("reject")}>Reject</button>
    </div>
  </div>;
}
