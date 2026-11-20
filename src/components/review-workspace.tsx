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
  Info,
  Minus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { ConfidenceScore } from "@/components/confidence-score";
import { findPhraseOccurrences, groupMentions, phraseKey } from "@/lib/mention-groups";
import type { Annotation, DocumentDetail, Label, LabelSchema } from "@/lib/types";
import type { CSSProperties } from "react";
import { splitAnnotatedText } from "@/lib/text-spans";
import { getWords, moveWordSelection, wordSelectionFromRange } from "@/lib/word-selection";
import type { WordSelection } from "@/lib/word-selection";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type PendingAnnotation = Omit<Annotation, "documentId" | "createdBy" | "createdByType" | "status" | "confidenceScore"> & {
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
  const wordSelectionRef = useRef<WordSelection | null>(null);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [schemas, setSchemas] = useState<LabelSchema[]>([]);
  const [sequence, setSequence] = useState({
    position: 0,
    total: 0,
    previousId: null as string | null,
    nextId: null as string | null,
  });
  const [selectedSpan, setSelectedSpan] = useState<{ text: string; start: number; end: number } | null>(null);
  const [pending, setPending] = useState<PendingAnnotation[]>([]);
  const [deEmphasize, setDeEmphasize] = useState(false);
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
  const labels = useMemo(() => schema?.labels ?? [], [schema]);
  const allAnnotations = useMemo(
    () => [...(document?.annotations ?? []), ...pending],
    [document?.annotations, pending],
  );
  const humanAnnotations = document?.annotations.filter((annotation) => annotation.createdByType === "HUMAN") ?? [];
  const aiGroups = groupMentions(document?.annotations.filter((annotation) => annotation.createdByType === "AI") ?? [])
    .map((group) => ({
      ...group,
      mentions: [...group.mentions, ...humanAnnotations.filter((annotation) =>
        annotation.labelId === group.mentions[0].labelId &&
        phraseKey(annotation.exactText) === phraseKey(group.mentions[0].exactText))],
    }));
  const standaloneHuman = humanAnnotations.filter((annotation) => !aiGroups.some((group) =>
    group.mentions.some((mention) => mention.id === annotation.id)));
  const annotationSections = [
    { title: "High confidence", description: "9–10/10", groups: aiGroups.filter((group) => group.level === "high") },
    { title: "Low confidence", description: "Below 9/10 · needs review", groups: aiGroups.filter((group) => group.level === "low") },
    { title: "Not scored", description: "No individual model score", groups: aiGroups.filter((group) => group.level === "unscored") },
  ];
  const progressPercent = document ? Math.round(sequence.position / Math.max(sequence.total, 1) * 100) : 0;

  function captureSelection() {
    const root = textRef.current;
    const selection = window.getSelection();
    wordSelectionRef.current = null;
    if (!root || !selection || !document) return;
    if (selection.isCollapsed) {
      setSelectedSpan(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const start = offsetOf(root, range.startContainer, range.startOffset);
    const end = offsetOf(root, range.endContainer, range.endOffset);
    const text = document.originalText.slice(start, end);
    if (!text || end <= start) return;
    setSelectedSpan({ text, start, end });
  }

  function navigateWords(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing || saving || !document) return;
    const root = textRef.current;
    const selection = window.getSelection();
    if (!root || !selection) return;
    const words = getWords(document.originalText);
    let current = wordSelectionRef.current;
    let caret: number | null = null;
    if (!current && selection.anchorNode && selection.focusNode &&
        root.contains(selection.anchorNode) && root.contains(selection.focusNode)) {
      const anchor = offsetOf(root, selection.anchorNode, selection.anchorOffset);
      const focus = offsetOf(root, selection.focusNode, selection.focusOffset);
      if (selection.isCollapsed) {
        caret = focus;
      } else {
        current = wordSelectionFromRange(words, Math.min(anchor, focus), Math.max(anchor, focus), anchor > focus);
      }
    }
    const next = moveWordSelection(words, current, caret, event.key === "ArrowRight" ? 1 : -1, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    const first = words[Math.min(next.anchor, next.focus)];
    const last = words[Math.max(next.anchor, next.focus)];
    const start = textPosition(root, first.start);
    const end = textPosition(root, last.end);
    if (!start || !end) return;
    if (next.focus < next.anchor) {
      selection.setBaseAndExtent(end.node, end.offset, start.node, start.offset);
    } else {
      selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
    }
    wordSelectionRef.current = next;
    setSelectedSpan({ text: document.originalText.slice(first.start, last.end), start: first.start, end: last.end });
  }

  const addAnnotation = useCallback((labelId: string) => {
    if (!selectedSpan || saving) return;
    const label = labels.find((item) => item.id === labelId);
    if (!label) return;
    if (allAnnotations.some((item) =>
      item.startOffset === selectedSpan.start &&
      item.endOffset === selectedSpan.end &&
      item.labelId === label.id
    )) {
      setNotice("That phrase already has this category.");
      setSelectedSpan(null);
      window.getSelection()?.removeAllRanges();
      if (wordSelectionRef.current) {
        wordSelectionRef.current = { anchor: wordSelectionRef.current.focus, focus: wordSelectionRef.current.focus };
      }
      return;
    }
    setNotice("");
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
    if (wordSelectionRef.current) {
      wordSelectionRef.current = { anchor: wordSelectionRef.current.focus, focus: wordSelectionRef.current.focus };
    }
  }, [allAnnotations, documentId, labels, saving, selectedSpan]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          !selectedSpan || saving || !/^[0-9]$/.test(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))) return;
      const label = labels[event.key === "0" ? 9 : Number(event.key) - 1];
      if (!label) return;
      event.preventDefault();
      addAnnotation(label.id);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [addAnnotation, labels, saving, selectedSpan]);

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
    wordSelectionRef.current = null;
    setSelectedSpan(null);
    router.push(`/documents/${targetId}`);
  }

  function focusAnnotation(annotation: Annotation | PendingAnnotation) {
    const root = textRef.current;
    if (!root) return;
    const start = textPosition(root, annotation.startOffset);
    const end = textPosition(root, annotation.endOffset);
    if (!start || !end) return;
    wordSelectionRef.current = null;
    setSelectedSpan({ text: annotation.exactText, start: annotation.startOffset, end: annotation.endOffset });
    root.focus({ preventScroll: true });
    window.getSelection()?.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
    root.scrollIntoView({ behavior: "smooth", block: "center" });
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
            <div className="complaint-text" ref={textRef} onMouseUp={captureSelection} onKeyDown={navigateWords} tabIndex={0} role="textbox" aria-label="Original complaint text" aria-describedby="keyboard-labeling-help" aria-readonly="true" aria-multiline="true">
              {renderHighlighted(document.originalText, allAnnotations, deEmphasize)}
            </div>
          </div>
          <div className="document-foot"><Info size={14} /> Owner-submitted text is preserved as received. Selecting text does not change it.</div>
          <div className="document-foot" id="keyboard-labeling-help"><Info size={14} /> Focus the complaint text and use left/right arrows to select words. Hold Shift to extend or shrink the selection; press a category key shown in the legend to label it.</div>
        </section>

        <aside className="annotation-panel">
          <div className="annotation-panel-head"><div><div className="panel-eyebrow">LABELING SCHEMA</div><h2>Annotations <span className="count-badge">{allAnnotations.length}</span></h2></div><div className="schema-menu">{schema?.name ?? "Loading schema"} <ChevronDown size={14} /></div></div>
          <div className="schema-description">{schema?.description}</div>
          <div className="label-legend">
            {labels.map((label, index) => <button type="button" key={label.id} disabled={!selectedSpan || saving} onMouseDown={(event) => event.preventDefault()} onClick={() => addAnnotation(label.id)} aria-label={`Label selection as ${label.name}`}><i style={{ backgroundColor: label.color }} />{index < 10 && <kbd>{index === 9 ? 0 : index + 1}</kbd>}{label.name}</button>)}
          </div>
          <div className="annotation-list-head"><span>SELECTED PHRASES</span><span>{allAnnotations.length} TOTAL</span></div>
          <div className="annotation-list">
            {annotationSections.map((section) => <section className="annotation-confidence-section" key={section.title} aria-label={section.title}>
              <div className="annotation-confidence-heading"><h3>{section.title}</h3><span>{section.groups.length}</span></div>
              {section.description && <p>{section.description}</p>}
              {section.groups.length === 0
                ? <div className="annotation-section-empty">No annotations in this section.</div>
                : section.groups.map(({ mentions }) => <div className="annotation-group" key={mentions[0].id}>
                  <div className="annotation-group-title"><strong className={mentions.some((item) => item.knownEntity) ? "known-entity-text" : ""}>{mentions[0].exactText}</strong>
                    {findPhraseOccurrences(document.originalText, mentions[0].exactText).length > 1 && <span className="entity-count">x{findPhraseOccurrences(document.originalText, mentions[0].exactText).length}</span>}
                    <span>{mentions[0].label.name}</span></div>
                  {mentions.some((item) => item.knownEntity) && <div className="known-entity-badge">Known entity: {mentions.find((item) => item.knownEntity)?.knownEntity}</div>}
                  {mentions.length > 1 && <p>Review matching occurrences together in Entity review.</p>}
                  {mentions.filter((item) => item.createdByType === "AI").length > 1 && <p>AI occurrence scores: {mentions.filter((item) => item.createdByType === "AI").map((item) =>
                    item.confidenceScore === null ? "Not scored" : `${item.confidenceScore}/10`).join(", ")}</p>}
                  <details><summary>{mentions.length > 1 ? "View individual occurrences" : "View annotation"}</summary>
                    {mentions.map((annotation) => <AnnotationRow
                      key={annotation.id}
                      annotation={annotation}
                      labels={labels}
                      onChange={(labelId) => void changeLabel(annotation, labelId)}
                      onRemove={() => void removeAnnotation(annotation)}
                      onFocus={() => focusAnnotation(annotation)}
                    />)}
                  </details>
                  {mentions.length === 1 && <ConfidenceScore score={mentions[0].confidenceScore} model={mentions[0].createdBy} />}
                </div>)}
            </section>)}
            <section className="annotation-confidence-section" aria-label="Human annotations and drafts">
              <div className="annotation-confidence-heading"><h3>Human annotations and drafts</h3></div>
              {[...standaloneHuman, ...pending].map((annotation) =>
                <AnnotationRow key={annotation.id} annotation={annotation} labels={labels}
                  onChange={(labelId) => void changeLabel(annotation, labelId)}
                  onRemove={() => void removeAnnotation(annotation)} onFocus={() => focusAnnotation(annotation)} />)}
            </section>
          </div>
          <div className="document-foot"><Info size={14} /> Review low-confidence and unscored AI labels in <Link className="annotation-review-link" href="/entity-review">Entity review</Link>.</div>
          <div className="schema-reminder"><Info size={14} /><span>Select a phrase, then press its category number or click a category to add a draft. Submit drafts to save them. Annotations can overlap.</span></div>
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
        <button className="annotation-phrase" onClick={onFocus} title="Show this phrase in the complaint">“{annotation.exactText}”</button>
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
          {pending ? "Unsaved" : "createdByType" in annotation && annotation.createdByType === "AI"
            ? `AI · ${annotation.status.toLowerCase()}`
            : "Saved"}
        </span>
        <span className="offset-hint">{annotation.startOffset}–{annotation.endOffset}</span>
      </div>
      {"createdByType" in annotation && annotation.createdByType === "AI" &&
        <ConfidenceScore score={annotation.confidenceScore} model={annotation.createdBy} />}
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

function textPosition(root: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const walker = window.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (offset <= length) return { node, offset };
    offset -= length;
    node = walker.nextNode();
  }
  return null;
}

function FileIcon() {
  return <span className="file-icon"><Plus size={11} /></span>;
}
