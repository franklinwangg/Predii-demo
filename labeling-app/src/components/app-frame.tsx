"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Layers3, Settings2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isReview = pathname.startsWith("/documents/");

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
        <Link className={`nav-link ${!isReview ? "active" : ""}`} href="/">
          <Layers3 size={17} strokeWidth={1.8} />
          <span>Datasets</span>
        </Link>
        <Link className={`nav-link ${isReview ? "active" : ""}`} href="/">
          <ClipboardList size={17} strokeWidth={1.8} />
          <span>Labeling queue</span>
          <span className="nav-arrow">›</span>
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
            <strong>{isReview ? "Document review" : "Datasets"}</strong>
          </div>
          <div className="topbar-right">
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
