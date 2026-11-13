"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, GitMerge, Layers3, Settings2, ShieldCheck, Tags } from "lucide-react";
import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isReview = pathname.startsWith("/documents/");
  const isAnnotations = pathname === "/annotations";
  const isSynonyms = pathname.startsWith("/synonyms");
  const isEntityReview = pathname.startsWith("/entity-review");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>
            <strong>predii</strong>
            <small>DATA STUDIO</small>
          </span>
        </Link>
        <div className="nav-section">WORKSPACE</div>
        <Link className={`nav-link ${pathname === "/" ? "active" : ""}`} href="/">
          <Layers3 size={17} strokeWidth={1.8} />
          <span>Datasets</span>
        </Link>
        <Link className={`nav-link ${isReview || isEntityReview ? "active" : ""}`} href="/entity-review">
          <ClipboardList size={17} strokeWidth={1.8} />
          <span>Entity review</span>
          <span className="nav-arrow">›</span>
        </Link>
        <Link className={`nav-link ${isAnnotations ? "active" : ""}`} href="/annotations">
          <Tags size={17} strokeWidth={1.8} />
          <span>Saved annotations</span>
        </Link>
        <Link className={`nav-link ${isSynonyms ? "active" : ""}`} href="/synonyms">
          <GitMerge size={17} strokeWidth={1.8} />
          <span>Synonym review</span>
        </Link>
        <div className="nav-divider" />
        <div className="nav-section">TOOLS</div>
        <Link className="nav-link" href="/">
          <Settings2 size={17} strokeWidth={1.8} />
          <span>Label schemas</span>
        </Link>
        <div className="sidebar-spacer" />
        <div className="sidebar-foot">
          <span className="sidebar-foot-icon"><ShieldCheck size={16} /></span>
          <span>
            <strong>Internal workspace</strong>
            <small>Secure labeling environment</small>
          </span>
        </div>
        <div className="profile">
          <span className="avatar">FL</span>
          <span><strong>Frank L.</strong><small>Data labeler</small></span>
          <span className="profile-menu">···</span>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span><span className="crumb-slash">/</span>
            <strong>{isReview ? "Document review" : isEntityReview ? "Entity review" : isAnnotations ? "Saved annotations" : isSynonyms ? "Synonym review" : "Datasets"}</strong>
          </div>
          <div className="topbar-right">
            <Link href={isAnnotations ? "/" : isSynonyms ? "/annotations" : "/synonyms"} className="mobile-nav-link">
              {isAnnotations ? "Datasets" : isSynonyms ? "Saved annotations" : "Synonym review"}
            </Link>
            <span className="connection-dot" /> All changes saved
            <span className="topbar-separator" />
            <span className="topbar-help">?</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
