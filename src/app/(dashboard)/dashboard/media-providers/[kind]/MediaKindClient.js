"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Toggle, AddCustomEmbeddingModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

// Top-level kind navigation tabs — real Next Links, .on = current kind.
const KIND_TABS = [
  { id: "embedding", label: "Embedding", href: "/dashboard/media-providers/embedding" },
  { id: "image", label: "Image", href: "/dashboard/media-providers/image" },
  { id: "video", label: "Video", href: "/dashboard/media-providers/video" },
  { id: "tts", label: "TTS", href: "/dashboard/media-providers/tts" },
  { id: "stt", label: "STT", href: "/dashboard/media-providers/stt" },
  { id: "web", label: "Web", href: "/dashboard/media-providers/web" },
];

// Kinds that support combos (currently disabled for image/tts — temporarily hidden).
// webSearch/webFetch handled by /web page.
const COMBO_KINDS = new Set([]);
const COMBO_BASE_NAMES = { image: "image-combo", tts: "tts-combo" };

function getEffectiveStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function MediaProviderCardStatus({ isNoAuth, allDisabled, total, connected, error }) {
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

function MediaProviderCard({ provider, kind, connections, isCustom, onToggle }) {
  const providerInfo = AI_PROVIDERS[provider.id];
  const isNoAuth = !!providerInfo?.noAuth;

  const providerConns = connections.filter((c) => c.provider === provider.id);
  const connected = providerConns.filter((c) => { const s = getEffectiveStatus(c); return s === "active" || s === "success"; }).length;
  const error = providerConns.filter((c) => { const s = getEffectiveStatus(c); return s === "error" || s === "expired" || s === "unavailable"; }).length;
  const total = providerConns.length;
  const allDisabled = total > 0 && providerConns.every((c) => c.isActive === false);

  const handleToggleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggle) onToggle(provider.id, allDisabled);
  };

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
          {total > 0 && (
            <button
              type="button"
              className="ml-auto opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
              onClick={handleToggleClick}
              aria-label={allDisabled ? "Enable provider" : "Disable provider"}
            >
              <Toggle
                checked={!allDisabled}
                onChange={() => {}}
                title={allDisabled ? "Enable provider" : "Disable provider"}
              />
            </button>
          )}
        </div>
        <div className="ct">
          {isCustom && <span className="tag">Custom</span>}
          <MediaProviderCardStatus isNoAuth={isNoAuth} allDisabled={allDisabled} total={total} connected={connected} error={error} />
        </div>
      </div>
    </Link>
  );
}

function ComboList({ combos }) {
  if (combos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {combos.map((combo) => (
        <Link key={combo.id} href={`/dashboard/media-providers/combo/${combo.id}`}>
          <div className="pcard">
            <div className="top">
              <span className="plogo" style={{ background: "#2f3238" }}>
                <span className="material-symbols-outlined text-[18px]">layers</span>
              </span>
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

export default function MediaKindClient({ initialConnections, initialNodes, initialCombos }) {
  const { kind } = useParams();
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections || []);
  const [customNodes, setCustomNodes] = useState(initialNodes || []);
  const [combos, setCombos] = useState(initialCombos || []);
  const [showAddCustomEmbedding, setShowAddCustomEmbedding] = useState(false);

  // webSearch/webFetch listing pages are merged into /web — return null and let server handle
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const isEmbedding = kind === "embedding";
  const supportsCombo = COMBO_KINDS.has(kind);

  if (kind === "webSearch" || kind === "webFetch") {
    router.replace("/dashboard/media-providers/web");
    return null;
  }
  if (!kindConfig) return notFound();

  const providers = getProvidersByKind(kind);
  const kindCombos = combos.filter((c) => c.kind === kind);

  // Map custom nodes to MediaProviderCard shape
  const customProviders = customNodes.map((n) => ({
    id: n.id,
    name: n.name || "Custom Embedding",
    color: "#6366F1",
    textIcon: "CE",
  }));

  const allProviders = [...providers, ...customProviders];

  const handleToggleProvider = async (providerId, newActive) => {
    const providerConns = connections.filter((c) => c.provider === providerId);
    setConnections((prev) =>
      prev.map((c) => (c.provider === providerId ? { ...c, isActive: newActive } : c))
    );
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        })
      )
    );
  };

  const handleCreateCombo = async () => {
    const base = COMBO_BASE_NAMES[kind] || `${kind}-combo`;
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
                <Link key={tab.id} href={tab.href} className={kind === tab.id ? "on" : ""}>
                  {tab.label}
                </Link>
              ))}
            </div>
            {supportsCombo && (
              <Button size="sm" icon="add" onClick={handleCreateCombo}>Create Combo</Button>
            )}
            {isEmbedding && (
              <Button size="sm" icon="add" onClick={() => setShowAddCustomEmbedding(true)}>
                Add Custom Embedding
              </Button>
            )}
          </div>
        </div>

        {supportsCombo && kindCombos.length > 0 && (
          <div className="p-3"><ComboList combos={kindCombos} /></div>
        )}

        {allProviders.length === 0 ? (
          <div className="empty">
            <div className="sub">No providers support <strong>{kindConfig.label}</strong> yet.</div>
          </div>
        ) : (
          <div className="hairline-grid">
            {providers.map((provider) => (
              <MediaProviderCard
                key={provider.id}
                provider={provider}
                kind={kind}
                connections={connections}
                onToggle={handleToggleProvider}
              />
            ))}
            {customProviders.map((provider) => (
              <MediaProviderCard
                key={provider.id}
                provider={provider}
                kind={kind}
                connections={connections}
                isCustom
                onToggle={handleToggleProvider}
              />
            ))}
          </div>
        )}
      </div>

      {isEmbedding && (
        <AddCustomEmbeddingModal
          isOpen={showAddCustomEmbedding}
          onClose={() => setShowAddCustomEmbedding(false)}
          onCreated={(node) => {
            setCustomNodes((prev) => [...prev, node]);
            setShowAddCustomEmbedding(false);
          }}
        />
      )}
    </div>
  );
}