"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Expand,
  Highlighter,
  Info,
  Minus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import type { Annotation, DocumentDetail, Label, LabelSchema } from "@/lib/types";
import type { CSSProperties } from "react";
import { splitAnnotatedText } from "@/lib/text-spans";

type PendingAnnotation = Omit<Annotation, "documentId" | "createdBy" | "createdByType" | "status"> & {
  id: string;
  pending: true;
};

const STOP_WORDS = new Set([
  "a", "about", "after", "all", "also", "am", "an", "and", "are", "as", "at", "be",
  "because", "been", "before", "being", "but", "by", "can", "could", "did", "do",
  "does", "during", "each", "for", "from", "had", "has", "have", "he", "her", "here",
  "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "may", "might",
  "more", "most", "my", "of", "on", "or", "our", "out", "over", "she", "should",
  "so", "some", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "to", "under", "up", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "would", "you", "your",
  "while",
]);

export function ReviewWorkspace({ documentId }: { documentId: string }) {
  const router = useRouter();
  const textRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [schemas, setSchemas] = useState<LabelSchema[]>([]);
  const [sequence, setSequence] = useState({
    position: 0,
    total: 0,
    previousId: null as string | null,
    nextId: null as string | null,
  });
  const [selectedSpan, setSelectedSpan] = useState<{ text: string; start: number; end: number } | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [pending, setPending] = useState<PendingAnnotation[]>([]);
  const [deEmphasize, setDeEmphasize] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDocument = useCallback(async () => {
    setError("");
    try {
      const [documentResult, schemaResult] = await Promise.all([
        apiRequest<{
          document: DocumentDetail;
          position: number;
          total: number;
          previousDocumentId: string | null;
          nextDocumentId: string | null;
        }>(`/api/documents/${documentId}`),
        apiRequest<{ schemas: LabelSchema[] }>("/api/schemas"),
      ]);
      setDocument(documentResult.document);
      setSchemas(schemaResult.schemas);
      setSequence({
        position: documentResult.position,
        total: documentResult.total,
        previousId: documentResult.previousDocumentId,
        nextId: documentResult.nextDocumentId,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this complaint.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    queueMicrotask(() => void loadDocument());
  }, [loadDocument]);

  const schema = schemas.find((item) => item.id === document?.dataset.labelSchemaId);
  const labels = schema?.labels ?? [];
  const allAnnotations = useMemo(
    () => [...(document?.annotations ?? []), ...pending],
    [document?.annotations, pending],
  );
  const progressPercent = document ? Math.round(sequence.position / Math.max(sequence.total, 1) * 100) : 0;

  function captureSelection() {
    const root = textRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || !document) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const start = offsetOf(root, range.startContainer, range.startOffset);
    const end = offsetOf(root, range.endContainer, range.endOffset);
    const text = document.originalText.slice(start, end);
    if (!text || end <= start) return;
    setSelectedSpan({ text, start, end });
    setContextOpen(true);
    if (!selectedLabelId && labels[0]) setSelectedLabelId(labels[0].id);
  }

  function addAnnotation() {
    if (!selectedSpan || !selectedLabelId) return;
    const label = labels.find((item) => item.id === selectedLabelId);
    if (!label) return;
    if (allAnnotations.some((item) =>
      item.startOffset === selectedSpan.start &&
      item.endOffset === selectedSpan.end &&
      item.labelId === label.id
    )) {
      setNotice("That phrase already has this category.");
      return;
    }
    setPending((items) => [
      ...items,
      {
        id: `draft-${crypto.randomUUID()}`,
        documentId,
        exactText: selectedSpan.text,
        startOffset: selectedSpan.start,
        endOffset: selectedSpan.end,
        labelId: label.id,
        label,
        pending: true,
      },
    ]);
    setSelectedSpan(null);
    window.getSelection()?.removeAllRanges();
  }

  async function changeLabel(annotation: Annotation | PendingAnnotation, labelId: string) {
    const label = labels.find((item) => item.id === labelId);
    if (!label) return;
    if ("pending" in annotation && annotation.pending) {
      setPending((items) => items.map((item) => item.id === annotation.id ? { ...item, labelId, label } : item));
      return;
    }
    try {
      const result = await apiRequest<{ annotation: Annotation }>(`/api/annotations/${annotation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ labelId }),
      });
      setDocument((current) => current ? {
        ...current,
        annotations: current.annotations.map((item) => item.id === annotation.id ? result.annotation : item),
      } : current);
      setNotice("Annotation category updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update category.");
    }
  }

  async function removeAnnotation(annotation: Annotation | PendingAnnotation) {
    if ("pending" in annotation && annotation.pending) {
      setPending((items) => items.filter((item) => item.id !== annotation.id));
      return;
    }
    try {
      await apiRequest<void>(`/api/annotations/${annotation.id}`, { method: "DELETE" });
      setDocument((current) => current ? {
        ...current,
        annotations: current.annotations.filter((item) => item.id !== annotation.id),
        labelingStatus: current.annotations.length <= 1 ? "UNLABELED" : current.labelingStatus,
      } : current);
      setNotice("Annotation removed.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove annotation.");
    }
  }

  async function submitAnnotations() {
    if (!pending.length && document?.labelingStatus === "LABELED") return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ annotations: Annotation[] }>(
        `/api/documents/${documentId}/annotations`,
        {
          method: "POST",
          body: JSON.stringify({
            annotations: pending.map(({ labelId, exactText, startOffset, endOffset }) => ({
              labelId,
              exactText,
              startOffset,
              endOffset,
              createdBy: "local-labeler",
              createdByType: "HUMAN",
              status: "ACCEPTED",
            })),
          }),
        },
      );
      setDocument((current) => current ? {
        ...current,
        annotations: [...current.annotations, ...result.annotations].sort(
          (a, b) => a.startOffset - b.startOffset,
        ),
        labelingStatus: "LABELED",
      } : current);
      setPending([]);
      setNotice(
        result.annotations.length > 0
          ? `${result.annotations.length} annotation${result.annotations.length === 1 ? "" : "s"} saved.`
          : "Complaint marked reviewed with no annotations.",
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save annotations.");
    } finally {
      setSaving(false);
    }
  }

  function navigateTo(targetId: string | null) {
    if (!targetId || pending.length > 0) return;
    router.push(`/documents/${targetId}`);
  }

  if (loading) {
    return <div className="page-loading"><span className="spinner" /> Loading complaint…</div>;
  }
  if (!document) {
    return <div className="page-wrap"><div className="alert alert-error"><CircleAlert size={18} />{error || "Complaint not found."}</div><Link href="/" className="text-link"><ArrowLeft size={15} /> Back to datasets</Link></div>;
  }

  return (
    <div className="review-page">
      <div className="review-toolbar">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Datasets</Link>
        <div className="review-document-count">
          <span>COMPLAINT</span>
          <strong>ODI-{document.sourceId}</strong>
          <span className={`status-pill status-${document.labelingStatus.toLowerCase().replace("_", "-")}`}><span />{document.labelingStatus === "LABELED" ? "Labeled" : "Unlabeled"}</span>
        </div>
        <div className="review-nav">
          <span>{sequence.position} <i>/</i> {sequence.total}</span>
          <button className="icon-button" disabled={!sequence.previousId || pending.length > 0} onClick={() => navigateTo(sequence.previousId)} aria-label="Previous complaint"><ChevronLeft size={19} /></button>
          <button className="icon-button" disabled={!sequence.nextId || pending.length > 0} onClick={() => navigateTo(sequence.nextId)} aria-label="Next complaint"><ChevronRight size={19} /></button>
        </div>
      </div>
      {pending.length > 0 && <div className="unsaved-banner"><Info size={15} /> You have unsaved annotations. Save them before moving to another complaint.</div>}
      {error && <div className="alert alert-error review-alert"><CircleAlert size={17} />{error}</div>}
      {notice && <div className="alert alert-success review-alert"><Check size={17} />{notice}</div>}

      <div className="review-heading">
        <div><div className="eyebrow">{document.dataset.name}</div><h1>Review complaint <span>ODI-{document.sourceId}</span></h1><p>{document.vehicleMake} {document.vehicleModel} <b>·</b> {document.vehicleYear} model year</p></div>
        <div className="review-progress"><span>QUEUE PROGRESS</span><strong>{sequence.position} <i>/</i> {sequence.total}</strong><div className="mini-track"><span style={{ width: `${progressPercent}%` }} /></div></div>
      </div>

      <div className="review-grid">
        <section className="document-panel">
          <div className="panel-title-row">
            <div><div className="panel-eyebrow"><FileIcon /> SOURCE DOCUMENT</div><h2>Original complaint</h2></div>
            <button type="button" className={`toggle-button ${deEmphasize ? "toggle-on" : ""}`} onClick={() => setDeEmphasize((value) => !value)} aria-pressed={deEmphasize}>
              <span className="toggle-track"><span /></span> De-emphasize common words
            </button>
          </div>
          <div className="document-meta"><span><span className="source-dot" /> NHTSA OWNER COMPLAINT</span><span>Source ID: {document.sourceId}</span></div>
          <div className="complaint-paper">
            <div className="paper-gutter"><span>01</span><span className="paper-line" /></div>
            <div className="complaint-text" ref={textRef} onMouseUp={captureSelection} role="textbox" aria-label="Original complaint text" aria-readonly="true">
              {renderHighlighted(document.originalText, allAnnotations, deEmphasize)}
            </div>
          </div>
          {selectedSpan && (
            <div className="selection-card">
              <div className="selection-caption"><Highlighter size={14} /> SELECTED PHRASE <span>·</span> {selectedSpan.end - selectedSpan.start} characters</div>
              <div className="selection-phrase">“{selectedSpan.text}”</div>
              <div className="selection-actions">
                <label className="select-wrap label-select">
                  <select value={selectedLabelId} onChange={(event) => setSelectedLabelId(event.target.value)} aria-label="Choose entity category">
                    {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                  </select><ChevronDown size={14} />
                </label>
                <button className="button button-primary button-small" onClick={addAnnotation}><Plus size={15} /> Add annotation</button>
              </div>
            </div>
          )}
          {contextOpen && selectedSpan && (
            <div className="context-card">
              <div><Expand size={14} /> CONTEXT <button onClick={() => setContextOpen(false)} aria-label="Close context">×</button></div>
              <p>{surroundingContext(document.originalText, selectedSpan.start, selectedSpan.end)}</p>
            </div>
          )}
          <div className="document-foot"><Info size={14} /> Owner-submitted text is preserved as received. Selecting text does not change it.</div>
        </section>

        <aside className="annotation-panel">
          <div className="annotation-panel-head"><div><div className="panel-eyebrow">LABELING SCHEMA</div><h2>Annotations <span className="count-badge">{allAnnotations.length}</span></h2></div><div className="schema-menu">{schema?.name ?? "Loading schema"} <ChevronDown size={14} /></div></div>
          <div className="schema-description">{schema?.description}</div>
          <div className="label-legend">
            {labels.map((label) => <span key={label.id}><i style={{ backgroundColor: label.color }} />{label.name}</span>)}
          </div>
          <div className="annotation-list-head"><span>SELECTED PHRASES</span><span>{allAnnotations.length} TOTAL</span></div>
          <div className="annotation-list">
            {allAnnotations.length > 0 ? allAnnotations.map((annotation) => (
              <AnnotationRow
                key={annotation.id}
                annotation={annotation}
                labels={labels}
                onChange={(labelId) => void changeLabel(annotation, labelId)}
                onRemove={() => void removeAnnotation(annotation)}
                onFocus={() => {
                  setSelectedSpan({ text: annotation.exactText, start: annotation.startOffset, end: annotation.endOffset });
                  setContextOpen(true);
                  textRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            )) : (
              <div className="annotation-empty"><div className="annotation-empty-icon"><Highlighter size={17} /></div><strong>No annotations yet</strong><p>Select a phrase in the complaint to assign an entity category.</p></div>
            )}
          </div>
          {selectedSpan && <div className="context-inline"><Info size={14} /><span>{surroundingContext(document.originalText, selectedSpan.start, selectedSpan.end)}</span></div>}
          <div className="schema-reminder"><Info size={14} /><span>Select words or full phrases in the complaint, then assign a category. Annotations can overlap.</span></div>
          <div className="annotation-actions">
            <button className="button button-secondary" disabled={!pending.length} onClick={() => setPending([])}><Minus size={15} /> Discard new</button>
            <button className="button button-primary" disabled={saving || (!pending.length && document.labelingStatus === "LABELED")} onClick={() => void submitAnnotations()}>
              {saving ? <span className="spinner spinner-light" /> : <Save size={15} />}
              {saving ? "Saving…" : pending.length ? `Submit ${pending.length} annotation${pending.length === 1 ? "" : "s"}` : "Mark reviewed"}
            </button>
          </div>
          <div className="annotation-next">
            <button disabled={!sequence.previousId || pending.length > 0} onClick={() => navigateTo(sequence.previousId)}><ChevronLeft size={15} /> Previous complaint</button>
            <button disabled={!sequence.nextId || pending.length > 0} onClick={() => navigateTo(sequence.nextId)}>Next complaint <ChevronRight size={15} /></button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AnnotationRow({ annotation, labels, onChange, onRemove, onFocus }: {
  annotation: Annotation | PendingAnnotation;
  labels: Label[];
  onChange: (labelId: string) => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  const pending = "pending" in annotation && annotation.pending;
  return (
    <div className={`annotation-row ${pending ? "annotation-pending" : ""}`}>
      <div className="annotation-row-top">
        <button className="annotation-phrase" onClick={onFocus} title="Show this phrase in context">“{annotation.exactText}”</button>
        <button className="annotation-remove" onClick={onRemove} title={pending ? "Remove draft annotation" : "Delete annotation"} aria-label="Remove annotation"><Trash2 size={14} /></button>
      </div>
      <div className="annotation-row-bottom">
        <label className="annotation-label" style={{ borderColor: annotation.label.color, color: annotation.label.color }}>
          <i style={{ backgroundColor: annotation.label.color }} />
          <select value={annotation.labelId} onChange={(event) => onChange(event.target.value)} aria-label={`Category for ${annotation.exactText}`}>
            {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
          </select>
          <ChevronDown size={12} />
        </label>
        <span className={`annotation-state ${pending ? "draft-state" : ""}`}>
          {pending ? "Unsaved" : "createdByType" in annotation && annotation.createdByType === "AI" ? "AI proposal" : "Saved"}
        </span>
        <span className="offset-hint">{annotation.startOffset}–{annotation.endOffset}</span>
      </div>
    </div>
  );
}

function renderHighlighted(text: string, annotations: (Annotation | PendingAnnotation)[], deEmphasize: boolean) {
  if (!text) return <span className="text-placeholder">No original complaint text was provided.</span>;
  return splitAnnotatedText(text, annotations).map((segment) => {
    const active = segment.annotations;
    const content = emphasizeStopWords(segment.text, deEmphasize);
    if (!active.length) return <span key={`${segment.start}-${segment.end}`}>{content}</span>;
    const colors = [...new Set(active.map((annotation) => annotation.label.color))];
    return (
      <mark
        key={`${segment.start}-${segment.end}`}
        className={`highlight-segment ${colors.length > 1 ? "highlight-overlap" : ""}`}
        style={{ "--highlight-color": colors[0] } as CSSProperties}
        title={active.map((annotation) => `${annotation.label.name}: ${annotation.exactText}`).join("\n")}
      >
        {content}
      </mark>
    );
  });
}

function emphasizeStopWords(text: string, active: boolean) {
  if (!active) return text;
  return text.split(/(\b[\w'-]+\b)/g).map((part, index) =>
    STOP_WORDS.has(part.toLowerCase())
      ? <span className="stopword" key={`${index}-${part}`}>{part}</span>
      : part,
  );
}

function offsetOf(root: HTMLElement, target: Node, nodeOffset: number) {
  const range = window.document.createRange();
  range.selectNodeContents(root);
  range.setEnd(target, nodeOffset);
  return range.toString().length;
}

function surroundingContext(text: string, start: number, end: number) {
  const paragraphStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextParagraphBreak = text.indexOf("\n", end);
  const paragraphEnd = nextParagraphBreak < 0 ? text.length : nextParagraphBreak;
  const paragraph = text.slice(paragraphStart, paragraphEnd).trim();
  if (paragraph.length > 0 && (text.includes("\n") || paragraph.length > 260)) return paragraph;

  const sentenceBefore = Math.max(
    text.lastIndexOf(".", start - 1),
    text.lastIndexOf("!", start - 1),
    text.lastIndexOf("?", start - 1),
  );
  const afterOffsets = [text.indexOf(".", end), text.indexOf("!", end), text.indexOf("?", end)]
    .filter((offset) => offset >= 0);
  const sentenceEnd = afterOffsets.length ? Math.min(...afterOffsets) + 1 : text.length;
  return text.slice(sentenceBefore + 1, sentenceEnd).trim() || paragraph;
}

function FileIcon() {
  return <span className="file-icon"><Plus size={11} /></span>;
}
