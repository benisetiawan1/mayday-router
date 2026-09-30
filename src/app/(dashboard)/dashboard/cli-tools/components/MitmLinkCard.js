"use client";

import Link from "next/link";

/**
 * Clickable cell for MITM tools — navigates to /dashboard/mitm on click.
 */
export default function MitmLinkCard({ tool }) {
  return (
    <Link href="/dashboard/mitm" className="block">
      <div className="tcell transition-colors hover:bg-surface-2">
        <span className="nm">{tool.id}</span>
        <span className="st2">
          <span className="tag b">MITM</span>
        </span>
      </div>
    </Link>
  );
}