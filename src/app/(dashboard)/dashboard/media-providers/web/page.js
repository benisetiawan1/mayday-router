"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

const KIND_TABS = [
  { id: "embedding", label: "Embedding", href: "/dashboard/media-providers/embedding" },
  { id: "image", label: "Image", href: "/dashboard/media-providers/image" },
  { id: "video", label: "Video", href: "/dashboard/media-providers/video" },
  { id: "tts", label: "TTS", href: "/dashboard/media-providers/tts" },
  { id: "stt", label: "STT", href: "/dashboard/media-providers/stt" },
  { id: "web", label: "Web", href: "/dashboard/media-providers/web" },
];

function getEffectiveStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function WebProviderCardStatus({ isNoAuth, allDisabled, total, connected, error }) {
  if (isNoAuth) return <span className="tag g"><span className="led ok"></span>Ready</span>;
  if (allDisabled) return <span className="tag"><span className="led info"></span>Disabled</span>;
  if (total === 0) return <span className="tag"><span className="led info"></span>No connections</span>;
  return (
    <>
      {connected > 0 && <span className="tag g"><span className="led ok"></span>{connected} Connected</span>}
      {error > 0 && <span className="tag w"><span className="led warn"></span>{error} Error</span>}
      {connected === 0 && error === 0 && <span className="tag"><span className="led info"></span>{total} Added</span>}
    </>
  );
}

function ProviderCard({ provider, kind, connections }) {
  const providerInfo = AI_PROVIDERS[provider.id];
  const isNoAuth = !!providerInfo?.noAuth;
  const providerConns = connections.filter((c) => c.provider === provider.id);
  const connected = providerConns.filter((c) => { const s = getEffectiveStatus(c); return s === "active" || s === "success"; }).length;
  const error = providerConns.filter((c) => { const s = getEffectiveStatus(c); return s === "error" || s === "expired" || s === "unavailable"; }).length;
  const total = providerConns.length;
  const allDisabled = total > 0 && providerConns.every((c) => c.isActive === false);

  return (
    <Link href={`/dashboard/media-providers/${kind}/${provider.id}`} className="group block">
      <div className={`pcard ${allDisabled ? "opacity-50" : ""}`}>
        <div className="top">
          <div className="plogo" style={{ background: provider.color || "#475569" }}>
            <ProviderIcon
              src={`/providers/${provider.id}.webp`}
              alt={provider.name}
              size={30}
              className="object-contain"
              fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </div>
          <div className="nm">{provider.name}</div>
        </div>
        <div className="ct">
          <WebProviderCardStatus isNoAuth={isNoAuth} allDisabled={allDisabled} total={total} connected={connected} error={error} />
        </div>
      </div>
    </Link>
  );
}

function ComboList({ combos, kind }) {
  if (combos.length === 0) {
    return <p className="dim">No combos yet.</p>;
  }
  return (
    <div className="hairline-grid">
      {combos.map((combo) => (
        <Link key={combo.id} href={`/dashboard/media-providers/combo/${combo.id}`} className="block">
          <div className="pcard">
            <div className="top">
              <div className="plogo" style={{ background: "#2f3238" }}>
                <span className="material-symbols-outlined text-[18px]">layers</span>
              </div>
              <div>
                <div className="nm">{combo.name}</div>
                <div className="sid">{combo.models.length} models</div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Section({ title, kind, providers, connections, combos, onCreateCombo }) {
  return (
    <div>
      <div className="panel-head">
        <span className="t">{title}</span>
        <div className="acts">
          <span className="dim">({providers.length} providers · {combos.length} combos)</span>
          <Button size="sm" icon="add" onClick={onCreateCombo}>Create Combo</Button>
        </div>
      </div>

      {combos.length > 0 && (
        <div className="p-3">
          <ComboList combos={combos} kind={kind} />
        </div>
      )}

      {providers.length === 0 ? (
        <div className="empty">
          <div className="sub">No providers.</div>
        </div>
      ) : (
        <div className="hairline-grid">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} kind={kind} connections={connections} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WebProvidersPage() {
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [combos, setCombos] = useState([]);

  const fetchAll = async () => {
    try {
      const [connsRes, combosRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/combos", { cache: "no-store" }),
      ]);
      if (connsRes.ok) setConnections((await connsRes.json()).connections || []);
      if (combosRes.ok) setCombos((await combosRes.json()).combos || []);
    } catch { /* noop */ }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);

  const searchProviders = getProvidersByKind("webSearch");
  const fetchProviders = getProvidersByKind("webFetch");
  const searchCombos = combos.filter((c) => c.kind === "webSearch");
  const fetchCombos = combos.filter((c) => c.kind === "webFetch");

  const handleCreateCombo = async (kind) => {
    // Generate unique default name
    const base = kind === "webSearch" ? "search-combo" : "fetch-combo";
    let name = base;
    let i = 1;
    const existing = new Set(combos.map((c) => c.name));
    while (existing.has(name)) { name = `${base}-${i++}`; }
    const res = await fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, models: [], kind }),
    });
    if (res.ok) {
      const created = await res.json();
      router.push(`/dashboard/media-providers/combo/${created.id}`);
    } else {
      const err = await res.json();
      alert(err.error || "Failed to create combo");
    }
  };

  return (
    <div className="flex flex-col">
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · Media providers</span>
          <div className="acts">
            <div className="seg">
              {KIND_TABS.map((tab) => (
                <Link key={tab.id} href={tab.href} className={tab.id === "web" ? "on" : ""}>
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <Section
          title="Web Search" kind="webSearch"
          providers={searchProviders} connections={connections} combos={searchCombos}
          onCreateCombo={() => handleCreateCombo("webSearch")}
        />

        <div className="border-t border-border" />

        <Section
          title="Web Fetch" kind="webFetch"
          providers={fetchProviders} connections={connections} combos={fetchCombos}
          onCreateCombo={() => handleCreateCombo("webFetch")}
        />
      </div>
    </div>
  );
}