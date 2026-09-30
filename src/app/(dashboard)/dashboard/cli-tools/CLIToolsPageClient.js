"use client";

import { useState, useEffect } from "react";
import { CardSkeleton, Button } from "@/shared/components";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import MitmLinkCard from "./components/MitmLinkCard";
import ToolSummaryCard from "./components/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

export default function CLIToolsPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toolStatuses, setToolStatuses] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL);
        if (res.ok && !cancelled) setToolStatuses(await res.json());
      } catch (error) {
        if (!cancelled) console.log("Error fetching tool statuses:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(ALL_STATUSES_URL);
      if (res.ok) setToolStatuses(await res.json());
    } catch (error) {
      console.log("Error fetching tool statuses:", error);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="tgrid">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex flex-col">
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · CLI tool configurations</span>
          <div className="acts">
            <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
              Refresh all statuses
            </Button>
          </div>
        </div>
        <div className="tgrid">
          {regularTools.map(([toolId, tool]) => (
            <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} status={toolStatuses[toolId]} />
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>02</b> · MITM</span>
        </div>
        <div className="tgrid">
          {mitmTools.map(([toolId, tool]) => (
            <MitmLinkCard key={toolId} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
}