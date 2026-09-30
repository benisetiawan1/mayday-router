"use client";

import Link from "next/link";

// Derive simple connected/configured/not-installed status from API payload
function getStatus(status) {
  if (!status) return { label: "Unknown", tone: "info" };
  if (!status.installed) return { label: "Not installed", tone: "info" };
  if (status.hasMayday) return { label: "Connected", tone: "ok" };
  return { label: "Not configured", tone: "warn" };
}

export default function ToolSummaryCard({ toolId, tool, status }) {
  const s = getStatus(status);
  return (
    <Link href={`/dashboard/cli-tools/${toolId}`} className="block">
      <div className="tcell transition-colors hover:bg-surface-2" title={tool.name}>
        <span className="nm">{toolId}</span>
        <span className={`st2 st ${s.tone}`}>
          <span className={`led ${s.tone}`} />
          {s.label}
        </span>
      </div>
    </Link>
  );
}