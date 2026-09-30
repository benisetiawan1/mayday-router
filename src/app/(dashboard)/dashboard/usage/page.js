"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UsageStats, RequestLogger, CardSkeleton } from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "details", label: "Details" },
  { value: "logs", label: "Logs" },
];

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState("today");

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col px-1 sm:px-0">
      {/* Tabs + period selector + LIVE on same row */}
      <div className="flex flex-wrap items-center gap-[14px] mb-3">
        <div className="utabs">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`utab${activeTab === t.value ? " on" : ""}`}
              onClick={() => handleTabChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeTab === "overview" && (
          <div className="seg">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={period === p.value ? "on" : ""}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {activeTab === "overview" && (
          <div className="st ok" style={{ marginLeft: "auto" }}>
            <span className="led ok pulse" />
            LIVE
          </div>
        )}
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
    </div>
  );
}
