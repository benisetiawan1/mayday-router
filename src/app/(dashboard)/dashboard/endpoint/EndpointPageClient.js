"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button, Input, Modal, CardSkeleton, Toggle, ConfirmModal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import {
  WENYAN_LOCALES,
  TUNNEL_BENEFITS,
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PING_MAX_MS,
  STATUS_POLL_FAST_MS,
  REACHABLE_MISS_THRESHOLD,
  CLIENT_PING_FAST_MS,
  CAVEMAN_LEVELS,
  PONYTAIL_LEVELS,
} from "./endpointConstants";
import { clientPingUrl, clientPingAny } from "./endpointPing";
import Link from "next/link";
import StatusAlert from "./components/StatusAlert";
import Tooltip from "./components/Tooltip";
import SecurityWarning from "./components/SecurityWarning";
import { buildProviderList } from "@/shared/utils/aclProviderList";
export default function APIPageClient() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  // ACL Edit Modal state
  const [editingKey, setEditingKey] = useState(null); // key object being edited
  const [editName, setEditName] = useState("");
  const [editKinds, setEditKinds] = useState([]); // selected kinds
  const [editProviders, setEditProviders] = useState([]); // selected provider IDs
  const [editCombos, setEditCombos] = useState([]); // selected combo names
  const [editKindsAll, setEditKindsAll] = useState(true); // null = all
  const [editProvidersAll, setEditProvidersAll] = useState(true);
  const [editCombosAll, setEditCombosAll] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [providerList, setProviderList] = useState([]);
  const [aliasMap, setAliasMap] = useState({}); // alias → provider ID
  const [comboList, setComboList] = useState([]);

  const [requireApiKey, setRequireApiKey] = useState(false);
  const [allowRemoteNoApiKey, setAllowRemoteNoApiKey] = useState(false);
  const [requireLogin, setRequireLogin] = useState(true);
  const [hasPassword, setHasPassword] = useState(true);
  const [tunnelDashboardAccess, setTunnelDashboardAccess] = useState(false);
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [headroomEnabled, setHeadroomEnabled] = useState(false);
  const [headroomUrl, setHeadroomUrl] = useState("http://localhost:8787");
  const [headroomCompressUserMessages, setHeadroomCompressUserMessages] = useState(false);
  const [headroomStatus, setHeadroomStatus] = useState({ installed: false, running: false, python: null, loading: true });
  const [showHeadroomInstallModal, setShowHeadroomInstallModal] = useState(false);
  const [headroomActionLoading, setHeadroomActionLoading] = useState(false);
  const [headroomActionError, setHeadroomActionError] = useState("");
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState("full");
  const [ponytailEnabled, setPonytailEnabled] = useState(false);
  const [ponytailLevel, setPonytailLevel] = useState("full");
  const [locale, setLocale] = useState("en");

  // Cloudflare Tunnel state
  const [tunnelChecking, setTunnelChecking] = useState(true);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelReachable, setTunnelReachable] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelProgress, setTunnelProgress] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [showEnableTunnelModal, setShowEnableTunnelModal] = useState(false);
  const [showDisableTunnelModal, setShowDisableTunnelModal] = useState(false);

  // Tailscale state
  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsReachable, setTsReachable] = useState(false);
  const [tsUrl, setTsUrl] = useState("");
  const [tsLoading, setTsLoading] = useState(false);
  const [tsProgress, setTsProgress] = useState("");
  const [tsStatus, setTsStatus] = useState(null);
  const [tsAuthUrl, setTsAuthUrl] = useState("");
  const [tsAuthLabel, setTsAuthLabel] = useState("");
  const [tsInstalled, setTsInstalled] = useState(null); // null=checking, true/false
  const [tsInstalling, setTsInstalling] = useState(false);
  const [tsInstallLog, setTsInstallLog] = useState([]);
  const [tsSudoPassword, setTsSudoPassword] = useState("");
  const [tsConnecting, setTsConnecting] = useState(false);
  const [showTsModal, setShowTsModal] = useState(false);
  const [showDisableTsModal, setShowDisableTsModal] = useState(false);
  const tsLogRef = useRef(null);

  // Debounce reachable=false: server may briefly return false during background refresh.
  // Only flip UI to "reconnecting" after N consecutive misses to avoid spinner flicker.
  const tunnelMissRef = useRef(0);
  const tsMissRef = useRef(0);
  // Browser-side reachable cache (independent of backend DNS quirks)
  const tunnelClientReachableRef = useRef(false);
  const tsClientReachableRef = useRef(false);
  // Track whether reachable=true was ever observed in this session.
  // Distinguishes "Checking..." (initial cold cache) from "Reconnecting..." (lost connection).
  const tunnelEverReachableRef = useRef(false);
  const tsEverReachableRef = useRef(false);
  const [tunnelEverReachable, setTunnelEverReachable] = useState(false);
  const [tsEverReachable, setTsEverReachable] = useState(false);

  // API key visibility toggle state
  const [visibleKeys, setVisibleKeys] = useState(new Set());

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability --
     The useEffects below intentionally run once on mount (locale detection,
     bootstrap fetch, scroll-into-view, status poll) or sync external state
     changes back into the UI (caveman level reset when locale changes). The
     handler functions they call (syncTunnelStatus, loadSettings, patchSetting,
     fetchData) are declared further down in this 2000-line file, which is
     a static-analysis limitation, not a runtime bug — closures capture the
     declarations correctly when the effects run. */

  // Client-side local/remote detection (UI hint only, not a security gate)
  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined")
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only detection on mount.
      setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
  }, []);

  // Track app UI locale to gate wenyan caveman levels
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time locale sync on mount; effect is intentional, not a derived value.
    setLocale(getCurrentLocale());
    return onLocaleChange(() => setLocale(getCurrentLocale()));
  }, []);

  const isWenyanLocale = WENYAN_LOCALES.includes(locale);

  // Reset wenyan level to "ultra" when leaving a Chinese locale
  // eslint-disable-next-line react-hooks/immutability -- patchSetting is declared further down in the file; captured by closure at runtime.
  useEffect(() => {
    const current = CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel);
    if (current?.wenyan && !isWenyanLocale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs external UI locale change back into local storage; effect is intentional.
      setCavemanLevel("ultra");
      patchSetting({ cavemanLevel: "ultra" });
    }
  }, [isWenyanLocale, cavemanLevel]);

  const { copied, copy } = useCopyToClipboard();

  // Security gate: block remote exposure while dashboard uses default password or login is off.
  const isLoginUnsafe = !requireLogin || !hasPassword;
  const unsafeReason = !requireLogin
    ? "Enable \"Require login\" and set a custom password before activating the tunnel."
    : "Change the default dashboard password before activating the tunnel.";

  // Auto-scroll install log
  useEffect(() => {
    if (tsLogRef.current) tsLogRef.current.scrollTop = tsLogRef.current.scrollHeight;
  }, [tsInstallLog]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial bootstrap fetch; the function declarations below are intentionally hoisted below the JSX (no derived state pattern fits a one-shot init).
    fetchData();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial bootstrap fetch.
    loadSettings();
  }, []);

  // Status poll: only while degraded (not yet reachable). Stop once healthy to avoid spam.
  // Visibility re-check: refresh once when tab becomes visible.
  // eslint-disable-next-line react-hooks/immutability -- syncTunnelStatus is declared further down; captured by closure at runtime.
  useEffect(() => {
    const anyEnabled = tunnelEnabled || tsEnabled;
    if (!anyEnabled) return;
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    const allHealthy = tunnelHealthy && tsHealthy;
    const onVisible = () => { if (!document.hidden) syncTunnelStatus(); };
    document.addEventListener("visibilitychange", onVisible);
    if (allHealthy) return () => document.removeEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (!document.hidden) syncTunnelStatus(); }, STATUS_POLL_FAST_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/immutability -- syncTunnelStatus is declared further down in the file; capturing via closure works fine at runtime but trips the static analysis.
  }, [tunnelEnabled, tsEnabled, tunnelReachable, tsReachable]);

  // Browser-side periodic ping: probes tunnel/tailscale URLs directly so UI stays
  // "reachable" even when backend DNS (1.1.1.1) hiccups on *.ts.net or *.trycloudflare.com.
  // Adaptive: slow when healthy, fast when degraded; pause when tab hidden.
  useEffect(() => {
    const probeBoth = async () => {
      if (document.hidden) return;
      if (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) {
        const ok = await clientPingAny(tunnelPublicUrl, tunnelUrl);
        tunnelClientReachableRef.current = ok;
        if (ok) { tunnelMissRef.current = 0; setTunnelReachable(true); if (!tunnelEverReachableRef.current) { tunnelEverReachableRef.current = true; setTunnelEverReachable(true); } }
        else { tunnelMissRef.current += 1; if (tunnelMissRef.current >= REACHABLE_MISS_THRESHOLD) setTunnelReachable(false); }
      } else {
        tunnelClientReachableRef.current = false;
      }
      if (tsEnabled && tsUrl) {
        const ok = await clientPingUrl(tsUrl);
        tsClientReachableRef.current = ok;
        if (ok) { tsMissRef.current = 0; setTsReachable(true); if (!tsEverReachableRef.current) { tsEverReachableRef.current = true; setTsEverReachable(true); } }
        else { tsMissRef.current += 1; if (tsMissRef.current >= REACHABLE_MISS_THRESHOLD) setTsReachable(false); }
      } else {
        tsClientReachableRef.current = false;
      }
    };
    const anyEnabled = (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) || (tsEnabled && tsUrl);
    if (!anyEnabled) return;
    probeBoth();
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    if (tunnelHealthy && tsHealthy) return;
    const id = setInterval(probeBoth, CLIENT_PING_FAST_MS);
    return () => clearInterval(id);
  }, [tunnelEnabled, tunnelUrl, tunnelPublicUrl, tsEnabled, tsUrl, tunnelReachable, tsReachable]);

  // Client-side reachable only (server no longer probes; watchdog handles backend health).
  // Miss-debounce: only flip to false after N consecutive misses.
  const updateReachable = useCallback((_unused, clientRef, missRef, setter, everRef, everSetter) => {
    const reachable = clientRef.current;
    if (reachable) {
      missRef.current = 0;
      setter(true);
      if (!everRef.current) {
        everRef.current = true;
        everSetter(true);
      }
    } else {
      missRef.current += 1;
      if (missRef.current >= REACHABLE_MISS_THRESHOLD) setter(false);
    }
  }, []);

  // Trust user intent (settingsEnabled): UI stays "enabled" while watchdog restarts process
  const syncTunnelStatus = async () => {
    try {
      const statusRes = await fetch("/api/tunnel/status", { cache: "no-store" });
      if (!statusRes.ok) return;
      const data = await statusRes.json();
      const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
      const tUrl = data.tunnel?.tunnelUrl || "";
      setTunnelUrl(tUrl);
      setTunnelPublicUrl(data.tunnel?.publicUrl || "");
      setTunnelEnabled(tEnabled);
      updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

      const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
      const tsUrlVal = data.tailscale?.tunnelUrl || "";
      setTsUrl(tsUrlVal);
      setTsEnabled(tsEn);
      updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
    } catch { /* ignore poll errors */ }
  };

  const loadSettings = async () => {
    setTunnelChecking(true);
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/tunnel/status", { cache: "no-store" })
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setRequireApiKey(data.requireApiKey || false);
        setAllowRemoteNoApiKey(data.allowRemoteNoApiKey || false);
        setRequireLogin(data.requireLogin !== false);
        setHasPassword(data.hasPassword || false);
        setTunnelDashboardAccess(data.tunnelDashboardAccess || false);
        setRtkEnabledState(data.rtkEnabled !== false);
        setHeadroomEnabled(!!data.headroomEnabled);
        setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
        setHeadroomCompressUserMessages(!!data.headroomCompressUserMessages);
        refreshHeadroomStatus();
        setCavemanEnabled(!!data.cavemanEnabled);
        setCavemanLevel(data.cavemanLevel || "full");
        setPonytailEnabled(!!data.ponytailEnabled);
        setPonytailLevel(data.ponytailLevel || "full");
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
        const tUrl = data.tunnel?.tunnelUrl || "";
        setTunnelUrl(tUrl);
        setTunnelPublicUrl(data.tunnel?.publicUrl || "");
        setTunnelEnabled(tEnabled);
        updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

        const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
        const tsUrlVal = data.tailscale?.tunnelUrl || "";
        setTsUrl(tsUrlVal);
        setTsEnabled(tsEn);
        updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    } finally {
      setTunnelChecking(false);
    }
  };

  const handleTunnelDashboardAccess = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tunnelDashboardAccess: value }),
      });
      if (res.ok) setTunnelDashboardAccess(value);
    } catch (error) {
      console.log("Error updating tunnelDashboardAccess:", error);
    }
  };

  const handleRequireApiKey = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApiKey: value }),
      });
      if (res.ok) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const handleAllowRemoteNoApiKey = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowRemoteNoApiKey: value }),
      });
      if (res.ok) setAllowRemoteNoApiKey(value);
    } catch (error) {
      console.log("Error updating allowRemoteNoApiKey:", error);
    }
  };

  const handleRtkEnabled = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtkEnabled: value }),
      });
      if (res.ok) setRtkEnabledState(value);
    } catch (error) {
      console.log("Error updating rtkEnabled:", error);
    }
  };

  const patchSetting = async (patch) => {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (error) {
      console.log("Error updating setting:", error);
    }
  };

  const handleCavemanEnabled = (value) => {
    setCavemanEnabled(value);
    patchSetting({ cavemanEnabled: value });
  };

  const handleHeadroomEnabled = (value) => {
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
  };

  const handleHeadroomUrlBlur = async () => {
    const next = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(next);
    await patchSetting({ headroomUrl: next });
    refreshHeadroomStatus();
  };

  const handleHeadroomCompressUserMessages = (value) => {
    setHeadroomCompressUserMessages(value);
    patchSetting({ headroomCompressUserMessages: value });
  };

  const refreshHeadroomStatus = useCallback(async () => {
    setHeadroomStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/headroom/status", { headers: { "Cache-Control": "no-store" } });
      const data = await res.json();
      setHeadroomStatus({ ...data, loading: false });
    } catch {
      setHeadroomStatus({ installed: false, running: false, python: null, loading: false });
    }
  }, []);

  const handleHeadroomStart = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start proxy");
      await refreshHeadroomStatus();
    } catch (e) {
      setHeadroomActionError(e.message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomStop = useCallback(async () => {
    setHeadroomActionLoading(true);
    try {
      await fetch("/api/headroom/stop", { method: "POST" });
      await refreshHeadroomStatus();
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handlePonytailEnabled = (value) => {
    setPonytailEnabled(value);
    patchSetting({ ponytailEnabled: value });
  };

  // ── ACL Edit Key handlers ──────────────────────────────────────────
  const ALL_KINDS = ["llm", "embedding", "image", "tts", "stt", "webSearch", "webFetch"];

  // Provider list for the ACL dialog is built by src/shared/utils/aclProviderList.js
  // (connections + nodes + registered noAuth/free providers). Auth-requiring
  // providers with zero connections are not shown.

  const handleOpenEditKey = async (key) => {
    setEditingKey(key);
    setEditName(key.name || "");
    const ap = key.allowedProviders;
    const ac = key.allowedCombos;
    const ak = key.allowedKinds;
    setEditProvidersAll(!ap);
    setEditCombosAll(!ac);
    setEditKindsAll(!ak);
    setEditCombos(ac || []);
    setEditKinds(ak || []);

    // Resolve stored ACL provider values to provider IDs in our list
    // Stored values can be: full provider ID, prefix (e.g. "tr"), or alias (e.g. "oc", "qd", "kc")
    if (ap && providerList.length > 0) {
      const matched = new Set();
      for (const stored of ap) {
        // Try direct match with provider ID
        const direct = providerList.find((p) => p.id === stored);
        if (direct) { matched.add(direct.id); continue; }
        // Try match by alias (e.g. "oc" → "opencode", "qd" → "qoder", "kc" → "kilocode")
        const byAlias = providerList.find((p) => p.alias === stored);
        if (byAlias) { matched.add(byAlias.id); continue; }
        // Try match by prefix (e.g. "tr" → TokenRouter)
        const byPrefix = providerList.find((p) => p.prefix === stored);
        if (byPrefix) { matched.add(byPrefix.id); continue; }
        // Keep as-is (unknown reference — may be a deleted provider)
        matched.add(stored);
      }
      setEditProviders([...matched]);
    } else {
      setEditProviders([]);
    }
  };

  const handleSaveEditKey = async () => {
    if (!editingKey) return;
    setEditSaving(true);
    try {
      const body = {
        name: editName.trim() || editingKey.name || "",
        allowedProviders: editProvidersAll ? null : editProviders,
        allowedCombos: editCombosAll ? null : editCombos,
        allowedKinds: editKindsAll ? null : editKinds,
      };
      const res = await fetch(`/api/keys/${editingKey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys((prev) => prev.map((k) => (k.id === editingKey.id ? { ...k, ...data.key } : k)));
        setEditingKey(null);
      }
    } catch (error) {
      console.log("Error saving key ACL:", error);
    } finally {
      setEditSaving(false);
    }
  };

  const toggleEditProvider = (id) => {
    setEditProviders((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const toggleEditCombo = (name) => {
    setEditCombos((prev) => prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]);
  };

  const toggleEditKind = (kind) => {
    setEditKinds((prev) => prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]);
  };

  const fetchData = async () => {
    try {
      const [keysRes, providersRes, combosRes, nodesRes] = await Promise.all([
        fetch("/api/keys", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/combos", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
      ]);

      const keysData = await keysRes.json();
      if (keysRes.ok) {
        setKeys(keysData.keys || []);
      }
      let connections = [];
      let nodes = [];
      let registered = [];
      if (providersRes.ok) {
        const pData = await providersRes.json();
        connections = pData.connections || [];
        if (pData.aliasMap) setAliasMap(pData.aliasMap);
        registered = pData.providers || [];
      }
      if (nodesRes.ok) {
        const nData = await nodesRes.json();
        nodes = nData.nodes || [];
      }
      setProviderList(buildProviderList(connections, nodes, registered));
      if (combosRes.ok) {
        const cData = await combosRes.json();
        setComboList(cData.combos || []);
      }
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // u2500u2500u2500 Cloudflare Tunnel handlers
  // Ping tunnel health until reachable. Race multiple URLs (shortlink + direct) — 1 OK is enough.
  const pingTunnelHealth = async (...urls) => {
    setTunnelLoading(true);
    setTunnelProgress("Waiting for tunnel ready...");
    const targets = urls.filter(Boolean).map((u) => `${u}/api/health`);
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      const ok = await Promise.any(targets.map(async (h) => {
        const p = await fetch(h, { mode: "cors", cache: "no-store" });
        if (p.ok) return true;
        throw new Error("not ready");
      })).catch(() => false);
      if (ok) {
        setTunnelEnabled(true);
        setTunnelLoading(false);
        setTunnelProgress("");
        return true;
      }
      // Every 5 pings (~10s), check if backend process still alive
      if ((Date.now() - start) % 10000 < TUNNEL_PING_INTERVAL_MS) {
        try {
          const statusRes = await fetch("/api/tunnel/status");
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (!status.tunnel?.enabled) {
              setTunnelStatus({ type: "error", message: "Tunnel process stopped unexpectedly." });
              setTunnelLoading(false);
              setTunnelProgress("");
              return false;
            }
          }
        } catch { /* ignore */ }
      }
    }
    setTunnelStatus({ type: "error", message: "Tunnel created but not reachable. Please try again." });
    setTunnelLoading(false);
    setTunnelProgress("");
    return false;
  };

  const handleEnableTunnel = async () => {
    setShowEnableTunnelModal(false);
    setTunnelLoading(true);
    setTunnelStatus(null);
    setTunnelProgress("Creating tunnel...");

    // Poll download progress while enable request is pending
    let polling = true;
    const pollProgress = async () => {
      while (polling) {
        try {
          const r = await fetch("/api/tunnel/status");
          if (r.ok) {
            const s = await r.json();
            if (s.download?.downloading) {
              setTunnelProgress(`Downloading cloudflared... ${s.download.progress}%`);
            } else if (polling) {
              setTunnelProgress("Creating tunnel...");
            }
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    pollProgress();

    try {
      const res = await fetch("/api/tunnel/enable", { method: "POST" });
      polling = false;
      const data = await res.json();
      if (!res.ok) {
        setTunnelStatus({ type: "error", message: data.error || "Failed to enable tunnel" });
        return;
      }

      const url = data.tunnelUrl;
      if (!url) {
        setTunnelStatus({ type: "error", message: "No tunnel URL returned" });
        return;
      }

      setTunnelUrl(url);
      setTunnelPublicUrl(data.publicUrl || "");
      await pingTunnelHealth(data.publicUrl, url);
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      polling = false;
      setTunnelLoading(false);
      setTunnelProgress("");
    }
  };

  const handleDisableTunnel = async () => {
    setTunnelLoading(true);
    setTunnelStatus(null);
    try {
      const res = await fetch("/api/tunnel/disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(false);
        setTunnelUrl("");
        setShowDisableTunnelModal(false);
        setTunnelStatus({ type: "success", message: "Tunnel disabled" });
      } else {
        setTunnelStatus({ type: "error", message: data.error || "Failed to disable tunnel" });
      }
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      setTunnelLoading(false);
    }
  };

  // u2500u2500u2500 Tailscale handlers
  const checkTailscaleInstalled = async () => {
    setTsInstalled(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-check");
      if (res.ok) {
        const data = await res.json();
        setTsInstalled(data.installed);
        return data;
      }
    } catch { /* ignore */ }
    setTsInstalled(false);
    return { installed: false };
  };

  const handleInstallTailscale = async () => {
    setTsInstalling(true);
    setTsStatus(null);
    setTsInstallLog([]);
    try {
      const res = await fetch("/api/tunnel/tailscale-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: tsSudoPassword }),
      });
      setTsSudoPassword("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "progress";
          let data = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            if (line.startsWith("data: ")) {
              try { data = JSON.parse(line.slice(6)); } catch { /* skip */ }
            }
          }
          if (!data) continue;
          if (event === "progress") {
            setTsInstallLog((prev) => [...prev.slice(-50), data.message]);
          } else if (event === "done") {
            setTsInstalled(true);
            setTsInstalling(false);
            setShowTsModal(false);
            handleConnectTailscale();
            return;
          } else if (event === "error") {
            setTsStatus({ type: "error", message: data.error || "Install failed" });
          }
        }
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsInstalling(false);
    }
  };

  // Ping Tailscale health until reachable
  const pingTsHealth = async (url) => {
    setTsProgress("Waiting for Tailscale ready...");
    const healthUrl = `${url}/api/health`;
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      try {
        const ping = await fetch(healthUrl, { mode: "no-cors", cache: "no-store" });
        if (ping.ok || ping.type === "opaque") return true;
      } catch { /* not ready yet */ }
    }
    return false;
  };

  // Show inline login button instead of auto-opening popup (browsers block popups
  // opened after async work because the user gesture is lost).
  const requestUserAuth = (url, label) => {
    setTsAuthUrl(url);
    setTsAuthLabel(label);
  };

  const clearUserAuth = () => {
    setTsAuthUrl("");
    setTsAuthLabel("");
  };

  const handleConnectTailscale = async () => {
    setShowTsModal(false);
    setTsConnecting(true);
    setTsLoading(true);
    setTsStatus(null);
    setTsProgress("Connecting...");
    clearUserAuth();
    try {
      const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setTsUrl(data.tunnelUrl || "");
        const reachable = await pingTsHealth(data.tunnelUrl);
        setTsEnabled(true);
        setTsStatus(reachable ? null : { type: "warning", message: "Connected but not reachable yet." });
        return;
      }

      if (data.needsLogin && data.authUrl) {
        requestUserAuth(data.authUrl, "Open Login Page");
        setTsProgress("Login required — click \"Open Login Page\" to continue");
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const r2 = await fetch("/api/tunnel/tailscale-check");
            if (r2.ok) {
              const check = await r2.json();
              if (check.loggedIn) {
                clearUserAuth();
                setTsProgress("Starting funnel...");
                const res2 = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
                const data2 = await res2.json();
                if (res2.ok && data2.success) {
                  setTsUrl(data2.tunnelUrl || "");
                  const ok2 = await pingTsHealth(data2.tunnelUrl);
                  setTsEnabled(true);
                  setTsStatus(ok2 ? null : { type: "warning", message: "Connected but not reachable yet." });
                } else if (data2.funnelNotEnabled && data2.enableUrl) {
                  await pollFunnelEnable(data2.enableUrl);
                } else {
                  setTsStatus({ type: "error", message: data2.error || "Failed to start funnel" });
                }
                return;
              }
            }
          } catch { /* retry */ }
        }
        clearUserAuth();
        setTsStatus({ type: "error", message: "Login timed out. Please try again." });
        return;
      }

      if (data.funnelNotEnabled && data.enableUrl) {
        await pollFunnelEnable(data.enableUrl);
        return;
      }

      setTsStatus({ type: "error", message: data.error || "Failed to connect" });
    } catch (error) {
      setTsStatus({ type: "error", message: error.message });
    } finally {
      setTsLoading(false);
      setTsConnecting(false);
      setTsProgress("");
      clearUserAuth();
    }
  };

  const pollFunnelEnable = async (enableUrl) => {
    requestUserAuth(enableUrl, "Open Funnel Settings");
    setTsProgress("Click \"Open Funnel Settings\" to enable Funnel...");
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          clearUserAuth();
          setTsUrl(data.tunnelUrl || "");
          const ok3 = await pingTsHealth(data.tunnelUrl);
          setTsEnabled(true);
          setTsStatus(ok3 ? null : { type: "warning", message: "Connected but not reachable yet." });
          return;
        }
        if (data.funnelNotEnabled) continue;
        if (data.error) {
          clearUserAuth();
          setTsStatus({ type: "error", message: data.error });
          return;
        }
      } catch { /* retry */ }
    }
    clearUserAuth();
    setTsStatus({ type: "error", message: "Timed out waiting for Funnel to be enabled." });
  };

  const handleDisableTailscale = async () => {
    setTsLoading(true);
    setTsStatus(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTsEnabled(false);
        setTsUrl("");
        setShowDisableTsModal(false);
        setTsStatus({ type: "success", message: "Tailscale disabled" });
      } else {
        setTsStatus({ type: "error", message: data.error || "Failed to disable Tailscale" });
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsLoading(false);
    }
  };

  const handleOpenTsModal = async () => {
    setTsStatus(null);
    setTsInstallLog([]);
    const data = await checkTailscaleInstalled();
    if (data?.installed && data?.hasCachedPassword) {
      handleConnectTailscale();
    } else {
      setShowTsModal(true);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys(keys.filter((k) => k.id !== id));
            setVisibleKeys(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch (error) {
          console.log("Error deleting key:", error);
        }
      }
    });
  };

  const handleToggleKey = async (id, isActive) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive } : k));
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  };

  const maskKey = (fullKey) => {
    if (!fullKey || fullKey.length <= 10) return fullKey || "";
    return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const [baseUrl, setBaseUrl] = useState("/v1");

  // Hydration fix: Only access window on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only hydration; this is the canonical useEffect+setState pattern, not a derived value.
      setBaseUrl(`${window.location.origin}/v1`);
    }
  }, []);

  // Endpoint hero ping (browser-side /api/health probe, see endpointPing.js)
  const [pingState, setPingState] = useState("idle"); // idle | checking | ok | fail
  const handlePing = async () => {
    if (pingState === "checking") return;
    setPingState("checking");
    const ok = await clientPingUrl(baseUrl);
    setPingState(ok ? "ok" : "fail");
    setTimeout(() => setPingState("idle"), 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const currentEndpoint = baseUrl;
  const epParsed = (() => {
    try {
      const u = new URL(currentEndpoint);
      return { proto: `${u.protocol}//`, host: u.host, path: u.pathname, port: u.port };
    } catch {
      return null;
    }
  })();
  const epProto = epParsed?.proto || "";
  const epHost = epParsed?.host || currentEndpoint;
  const epPath = epParsed?.path || "";
  const epPort = epParsed?.port || "";
  const headroomRunning = !!headroomStatus.running;
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = !!headroomStatus.canStart;
  const headroomManaged = headroomLocalUrl && !!headroomStatus.managedPid;
  const headroomStatusLabel = headroomStatus.loading
    ? "Checking…"
    : headroomRunning
      ? "Running"
      : headroomLocalUrl && !headroomStatus.installed
        ? "Not installed"
        : headroomLocalUrl
          ? "Proxy off"
          : "Unreachable";

  return (
<div className="flex flex-col">
      {/* 01 · Endpoints */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · Endpoints</span>
          <div className="acts">
            <button className="btn primary" onClick={() => copy(currentEndpoint, "endpoint_url")}>
              {copied === "endpoint_url" ? "Copied" : "Copy URL"}
            </button>
            <button className="btn" onClick={handlePing} disabled={pingState === "checking"}>
              {pingState === "checking" ? (
                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
              ) : pingState === "ok" ? (
                <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--color-success)" }}>check</span>
              ) : pingState === "fail" ? (
                <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--color-danger)" }}>close</span>
              ) : null}
              Ping
            </button>
          </div>
        </div>
        <div className="ep">
          <div className="url">{epProto}<span className="hl">{epHost}</span>{epPath}</div>
          {isRemoteHost ? (
            <span className="tag a">PUBLIC</span>
          ) : (
            <span className="tag">LOCAL{epPort ? ` :${epPort}` : ""}</span>
          )}
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">API key</div>
            <div className="v">{keys.length > 0 ? maskKey(keys[0].key) : "—"}</div>
          </div>
          <div className="kv">
            <div className="k">Auth</div>
            <div className="v">Bearer · require login: {requireLogin ? "on" : "off"}</div>
          </div>
          <div className="kv">
            <div className="k">OpenAI-compatible</div>
            <div className="v muted">/v1/chat · /v1/models · /v1/embeddings</div>
          </div>
          <div className="kv">
            <div className="k">Anthropic-compatible</div>
            <div className="v muted">/v1/messages · count_tokens</div>
          </div>
        </div>
      </div>

      {/* 02 · Remote access — tunnels */}
      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>02</b> · Remote access — tunnels</span>
          <div className="acts">
            {(tunnelEnabled || tsEnabled) ? <span className="tag g">ON</span> : <span className="tag w">OFF</span>}
          </div>
        </div>
        <div className="spec" style={{ borderTop: 0 }}>
          <div className="kv">
            <div className="k">Cloudflare tunnel</div>
            <div className="v flex flex-wrap items-center gap-2">
              {tunnelEnabled && !tunnelLoading && tunnelReachable ? (
                <>
                  <Input value={`${tunnelPublicUrl || tunnelUrl}/v1`} readOnly className="flex-1 min-w-0 font-mono text-sm" />
                  <button
                    onClick={() => copy(`${tunnelPublicUrl || tunnelUrl}/v1`, "tunnel_url")}
                    className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">{copied === "tunnel_url" ? "check" : "content_copy"}</span>
                  </button>
                  <button
                    onClick={() => setShowDisableTunnelModal(true)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Disable Tunnel"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : tunnelEnabled && !tunnelLoading && !tunnelReachable ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    {tunnelEverReachable ? "Tunnel reconnecting..." : "Tunnel checking..."}
                  </div>
                  <button
                    onClick={() => setShowDisableTunnelModal(true)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Disable Tunnel"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : tunnelLoading ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    {tunnelProgress || "Creating tunnel..."}
                  </div>
                  <button
                    onClick={() => { setTunnelLoading(false); setTunnelProgress(""); }}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Stop"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : tunnelStatus?.type === "error" ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-red-300 dark:border-red-800 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {tunnelStatus.message}
                  </div>
                  <Button size="sm" icon="cloud_upload" onClick={() => setShowEnableTunnelModal(true)}>Enable</Button>
                </>
              ) : tunnelChecking ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    Checking...
                  </div>
                  <button
                    onClick={() => setTunnelChecking(false)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Stop"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : (
                <Button
                  size="sm"
                  icon="cloud_upload"
                  onClick={() => {
                    if (isLoginUnsafe) {
                      setTunnelStatus({ type: "error", message: `Security required: ${unsafeReason}` });
                      return;
                    }
                    if (!requireApiKey) {
                      setTunnelStatus({ type: "error", message: "Security required: Enable \"Require API key\" before activating the tunnel." });
                      return;
                    }
                    setShowEnableTunnelModal(true);
                  }}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>
          <div className="kv">
            <div className="k">Tailscale</div>
            <div className="v flex flex-wrap items-center gap-2">
              {tsEnabled && !tsLoading && tsReachable ? (
                <>
                  <Input value={`${tsUrl}/v1`} readOnly className="flex-1 min-w-0 font-mono text-sm" />
                  <button
                    onClick={() => copy(`${tsUrl}/v1`, "ts_url")}
                    className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">{copied === "ts_url" ? "check" : "content_copy"}</span>
                  </button>
                  <button
                    onClick={() => setShowDisableTsModal(true)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Disable Tailscale"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : tsEnabled && !tsLoading && !tsReachable ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    {tsEverReachable ? "Tailscale reconnecting..." : "Tailscale checking..."}
                  </div>
                  <button
                    onClick={() => setShowDisableTsModal(true)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Disable Tailscale"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : (tsLoading || tsConnecting) ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    {tsProgress || "Connecting..."}
                  </div>
                  {tsAuthUrl && (
                    <Button
                      size="sm"
                      icon="open_in_new"
                      onClick={() => window.open(tsAuthUrl, "tailscale_auth", "width=600,height=700,noopener,noreferrer")}
                    >
                      {tsAuthLabel || "Open"}
                    </Button>
                  )}
                  <button
                    onClick={() => { setTsLoading(false); setTsConnecting(false); setTsProgress(""); clearUserAuth(); }}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                    title="Stop"
                  >
                    <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  </button>
                </>
              ) : tsStatus?.type === "error" ? (
                <>
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5 rounded border border-red-300 dark:border-red-800 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {tsStatus.message}
                  </div>
                  <Button size="sm" icon="vpn_lock" onClick={handleOpenTsModal}>Enable</Button>
                </>
              ) : (
                <Button
                  size="sm"
                  icon="vpn_lock"
                  onClick={() => {
                    if (isLoginUnsafe) {
                      setTsStatus({ type: "error", message: `Security required: ${unsafeReason}` });
                      return;
                    }
                    handleOpenTsModal();
                  }}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Pre-enable security gate banner */}
        {isLoginUnsafe && !tunnelEnabled && !tsEnabled && (
          <div className="banner warn">
            <span>⚠</span>
            <span>{unsafeReason}</span>
          </div>
        )}

        {/* Security warnings when tunnel or tailscale is active */}
        {(tunnelEnabled || tsEnabled) && (
          <div className="flex flex-col gap-2 px-4 py-3">
            {!requireApiKey && (
              <SecurityWarning
                message="Require API key is disabled — your endpoint is publicly accessible without authentication."
                action={{ label: "Enable", href: "#require-api-key" }}
              />
            )}
            {(!requireLogin || !hasPassword) && (
              <SecurityWarning
                message={
                  !requireLogin
                    ? "Require login is disabled — anyone can access your dashboard via tunnel."
                    : "Dashboard uses the default password — change it in Profile settings."
                }
                action={{
                  label: !requireLogin ? "Enable" : "Change password",
                  href: "/dashboard/profile",
                }}
              />
            )}
          </div>
        )}

        {/* Tunnel dashboard access option */}
        {(tunnelEnabled || tsEnabled) && (
          <div className="px-4 py-3 border-t border-border flex items-center gap-3">
            <Toggle
              checked={tunnelDashboardAccess}
              onChange={() => handleTunnelDashboardAccess(!tunnelDashboardAccess)}
            />
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-sm">Allow dashboard access via tunnel</p>
              <Tooltip text="When enabled, the dashboard can be accessed through your tunnel or Tailscale URL (login still required). When disabled, dashboard access via tunnel/Tailscale is completely blocked." />
            </div>
          </div>
        )}
      </div>

      {/* 03 · Token saver */}
      <div className="panel" id="rtk">
        <div className="panel-head">
          <span className="t"><b>03</b> · Token saver</span>
          <div className="acts">
            <Link href="/dashboard/token-saver" className="btn">Configure →</Link>
          </div>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">RTK · tool output</div>
            <div className="v flex items-center gap-2">
              <Toggle checked={rtkEnabled} onChange={() => handleRtkEnabled(!rtkEnabled)} />
              <span className="dim">{rtkEnabled ? "on" : "off"}</span>
            </div>
          </div>
          <div className="kv">
            <div className="k">Headroom · context</div>
            <div className="v flex items-center gap-2">
              <Toggle checked={headroomEnabled} onChange={() => handleHeadroomEnabled(!headroomEnabled)} />
              <span>{headroomStatusLabel}</span>
              <button
                type="button"
                onClick={() => setShowHeadroomInstallModal(true)}
                className="text-xs text-primary underline hover:opacity-80"
              >
                {headroomRunning ? "Manage" : "Setup"}
              </button>
            </div>
          </div>
          <div className="kv">
            <div className="k">Caveman · LLM output</div>
            <div className="v flex items-center gap-2">
              <Toggle checked={cavemanEnabled} onChange={() => handleCavemanEnabled(!cavemanEnabled)} />
              <span className="dim">{cavemanEnabled ? (CAVEMAN_LEVELS.find((l) => l.id === cavemanLevel)?.label || cavemanLevel) : "off"}</span>
            </div>
          </div>
          <div className="kv">
            <div className="k">Ponytail · lazy dev</div>
            <div className="v flex items-center gap-2">
              <Toggle checked={ponytailEnabled} onChange={() => handlePonytailEnabled(!ponytailEnabled)} />
              <span className="dim">{ponytailEnabled ? (PONYTAIL_LEVELS.find((l) => l.id === ponytailLevel)?.label || ponytailLevel) : "off"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 04 · API keys */}
      <div className="panel" id="require-api-key">
        <div className="panel-head">
          <span className="t"><b>04</b> · API keys</span>
          <div className="acts">
            <span className="tag">{requireApiKey ? "Require key: ON" : "Require key: OFF"}</span>
            <Button icon="add" onClick={() => setShowAddModal(true)}>Create Key</Button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="font-medium">Require API key</p>
            <p className="text-sm text-text-muted">
              Requests without a valid key will be rejected
            </p>
          </div>
          <Toggle
            checked={requireApiKey}
            onChange={() => handleRequireApiKey(!requireApiKey)}
          />
        </div>

        {isRemoteHost && !requireApiKey && (
          <div className="px-4 py-2">
            <SecurityWarning message="Endpoint is exposed without an API key." />
          </div>
        )}

        {!requireApiKey && isRemoteHost && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/50">
            <div>
              <p className="text-sm font-medium text-text-main">
                Allow Remote Access Without API Key
              </p>
              <p className="text-sm text-text-muted">
                Let non-loopback requests reach /v1/* without a key (use with caution)
              </p>
            </div>
            <Toggle
              checked={allowRemoteNoApiKey}
              onChange={() => handleAllowRemoteNoApiKey(!allowRemoteNoApiKey)}
            />
          </div>
        )}

        {!requireApiKey && allowRemoteNoApiKey && (
          <div className="px-4 py-2">
            <SecurityWarning message="Remote access without an API key is enabled — anyone who can reach this endpoint can use your providers." />
          </div>
        )}

        {keys.length === 0 ? (
          <div className="empty">
            <div className="big">No API keys yet</div>
            <div className="sub">Create your first API key to get started</div>
            <Button icon="add" onClick={() => setShowAddModal(true)}>
              Create Key
            </Button>
          </div>
        ) : (
          <div>
            <div className="row head" style={{ gridTemplateColumns: "1fr 170px 200px 90px 130px", gap: "10px" }}>
              <div>Key</div>
              <div>Value</div>
              <div>ACL</div>
              <div>Machine</div>
              <div>Actions</div>
            </div>
            {keys.map((key) => (
              <div
                key={key.id}
                className={`row ${key.isActive === false ? "opacity-60" : ""}`}
                style={{ gridTemplateColumns: "1fr 170px 200px 90px 130px", gap: "10px" }}
              >
                <div className="min-w-0">
                  <p className="cr-name">{key.name}</p>
                  <div className="sid">Created {new Date(key.createdAt).toLocaleDateString()}</div>
                  {key.isActive === false && (
                    <p className="text-xs text-orange-500 mt-1">Paused</p>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-1">
                  <code className="truncate text-xs text-text-muted font-mono">
                    {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                  </code>
                  <button
                    onClick={() => toggleKeyVisibility(key.id)}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary shrink-0"
                    title={visibleKeys.has(key.id) ? "Hide key" : "Show key"}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {visibleKeys.has(key.id) ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                  <button
                    onClick={() => copy(key.key, key.id)}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copied === key.id ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
                <div>
                  {(key.allowedProviders || key.allowedCombos || key.allowedKinds) ? (
                    <div className="flex flex-wrap gap-1">
                      {key.allowedProviders && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:bg-blue-500/20" title={key.allowedProviders.join(", ")}>
                          {key.allowedProviders.length === 0
                            ? "No providers"
                            : key.allowedProviders.map((stored) => {
                                const p = providerList.find((pp) => pp.id === stored || pp.alias === stored || pp.prefix === stored);
                                if (p) return p.displayName;
                                const resolved = aliasMap[stored];
                                if (resolved) return resolved;
                                return stored;
                              }).join(", ")}
                        </span>
                      )}
                      {key.allowedCombos && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 dark:bg-purple-500/20">
                          {key.allowedCombos.length === 0 ? "No combos" : key.allowedCombos.join(", ")}
                        </span>
                      )}
                      {key.allowedKinds && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 dark:bg-green-500/20">
                          {key.allowedKinds.length === 0 ? "No kinds" : key.allowedKinds.join(", ")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </div>
                <div>
                  {key.machineId ? (
                    <span className="st ok"><span className="led ok" />bound</span>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleOpenEditKey(key)}
                    className="p-2 hover:bg-primary/10 rounded text-primary"
                    title="Edit access control"
                  >
                    <span className="material-symbols-outlined text-[18px]">tune</span>
                  </button>
                  <Toggle
                    size="sm"
                    checked={key.isActive ?? true}
                    onChange={(checked) => {
                      if (key.isActive && !checked) {
                        setConfirmState({
                          title: "Pause API Key",
                          message: `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`,
                          onConfirm: async () => {
                            setConfirmState(null);
                            handleToggleKey(key.id, checked);
                          }
                        });
                      } else {
                        handleToggleKey(key.id, checked);
                      }
                    }}
                    title={key.isActive ? "Pause key" : "Resume key"}
                  />
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Key Modal */}
      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Production Key"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreateKey} fullWidth disabled={!newKeyName.trim()}>
              Create
            </Button>
            <Button
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
              }}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Created Key Modal */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 font-medium">
              Save this key now!
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              This is the only time you will see this key. Store it securely.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setCreatedKey(null)} fullWidth>
            Done
          </Button>
        </div>
      </Modal>

      {/* Edit ACL Modal */}
      <Modal
        isOpen={!!editingKey}
        title={`Edit Access: ${editingKey?.name || ""}`}
        onClose={() => !editSaving && setEditingKey(null)}
      >
        <div className="flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Key Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Key name" />
          </div>

          {/* Service Kinds */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Service Kinds</label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={editKindsAll} onChange={(e) => setEditKindsAll(e.target.checked)} />
                <span className="text-text-muted">All allowed</span>
              </label>
            </div>
            {!editKindsAll && (
              <div className="flex flex-wrap gap-2">
                {ALL_KINDS.map((kind) => (
                  <label key={kind} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${editKinds.includes(kind) ? "border-primary bg-primary/10 text-primary" : "border-border-subtle text-text-muted hover:border-primary/40"}`}>
                    <input type="checkbox" className="hidden" checked={editKinds.includes(kind)} onChange={() => toggleEditKind(kind)} />
                    {kind}
                  </label>
                ))}
              </div>
            )}
            {editKindsAll && <p className="text-xs text-text-muted">This key can access all service kinds.</p>}
          </div>

          {/* Providers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Providers</label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={editProvidersAll} onChange={(e) => setEditProvidersAll(e.target.checked)} />
                <span className="text-text-muted">All allowed</span>
              </label>
            </div>
            {!editProvidersAll && (
              <>
                <div className="max-h-60 overflow-y-auto border border-border-subtle rounded-lg p-2 space-y-1">
                  {providerList.length === 0 ? (
                    <p className="text-xs text-text-muted p-2">No providers configured.</p>
                  ) : (
                    providerList.map((p) => {
                      const checked = editProviders.includes(p.id);
                      return (
                        <label key={p.id} className={`flex items-center gap-2 px-2 py-2 rounded text-xs cursor-pointer transition-colors ${checked ? "bg-primary/10 text-primary" : "hover:bg-surface-2"}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleEditProvider(p.id)} className="rounded" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{p.displayName}</span>
                            {p.prefix && (
                              <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-surface-2 text-text-muted font-mono">{p.prefix}</span>
                            )}
                          </div>
                          <span className="text-text-muted text-[10px] shrink-0">{p.count} conn</span>
                        </label>
                      );
                    })
                  )}
                </div>
                {editProviders.length === 0 && (
                  <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-2 py-1 mt-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    <span>Warning: Zero providers selected. This key will have NO access to any providers (Deny All).</span>
                  </p>
                )}
              </>
            )}
            {editProvidersAll && <p className="text-xs text-text-muted">This key can access all providers ({providerList.length}).</p>}
          </div>

          {/* Combos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Combos</label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={editCombosAll} onChange={(e) => setEditCombosAll(e.target.checked)} />
                <span className="text-text-muted">All allowed</span>
              </label>
            </div>
            {!editCombosAll && (
              <div className="max-h-40 overflow-y-auto border border-border-subtle rounded-lg p-2 space-y-1">
                {comboList.length === 0 ? (
                  <p className="text-xs text-text-muted p-2">No combos configured.</p>
                ) : (
                  comboList.map((combo) => {
                    const name = combo.name || combo.id;
                    const checked = editCombos.includes(name);
                    return (
                      <label key={name} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${checked ? "bg-primary/10 text-primary" : "hover:bg-surface-2"}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleEditCombo(name)} className="rounded" />
                        <span>{name}</span>
                        <span className="text-text-muted ml-auto text-[10px]">{Array.isArray(combo.models) ? combo.models.length : 0} models</span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
            {editCombosAll && <p className="text-xs text-text-muted">This key can access all combos.</p>}
          </div>

          {/* ACL info */}
          <div className="text-xs text-text-muted bg-surface-2 rounded-lg p-3 border border-border-subtle">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li><strong>All allowed</strong> = unrestricted (default). No ACL filtering.</li>
              <li><strong>Unchecked + empty</strong> = deny everything of that type.</li>
              <li><strong>Checked items</strong> = only those items are accessible.</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={() => setEditingKey(null)} variant="ghost" fullWidth disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditKey} fullWidth disabled={editSaving}>
              {editSaving ? "Saving..." : "Save ACL"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Enable Tunnel Modal */}
      <Modal
        isOpen={showEnableTunnelModal}
        title="Enable Tunnel"
        onClose={() => setShowEnableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary">cloud_upload</span>
              <div>
                <p className="text-sm text-text-main font-medium mb-1">
                  Cloudflare Tunnel
                </p>
                <p className="text-sm text-text-muted">
                  Expose your local Mayday to the internet. No port forwarding, no static IP needed. Share endpoint URL with your team or use it in Cursor, Cline, and other AI tools from anywhere.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex flex-col items-center text-center p-3 rounded-lg bg-sidebar/50">
                <span className="material-symbols-outlined text-xl text-primary mb-1">{benefit.icon}</span>
                <p className="text-xs font-semibold">{benefit.title}</p>
                <p className="text-xs text-text-muted">{benefit.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted">
            Requires outbound port 7844 (TCP/UDP). Connection may take 10-30s.
          </p>

          <div className="flex gap-2">
            <Button onClick={handleEnableTunnel} fullWidth>
              Start Tunnel
            </Button>
            <Button onClick={() => setShowEnableTunnelModal(false)} variant="ghost" fullWidth>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Disable Cloudflare Tunnel Modal */}
      <Modal
        isOpen={showDisableTunnelModal}
        title="Disable Tunnel"
        onClose={() => !tunnelLoading && setShowDisableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">The Cloudflare tunnel will be disconnected. Remote access via tunnel URL will stop working.</p>
          <div className="flex gap-2">
            <Button onClick={handleDisableTunnel} fullWidth disabled={tunnelLoading} variant="danger">
              {tunnelLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button onClick={() => setShowDisableTunnelModal(false)} variant="ghost" fullWidth disabled={tunnelLoading}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Tailscale Modal */}
      <Modal
        isOpen={showTsModal}
        title="Tailscale Funnel"
        onClose={() => { if (!tsInstalling) { setShowTsModal(false); setTsSudoPassword(""); setTsStatus(null); } }}
      >
        <div className="flex flex-col gap-4">
          {/* Checking state */}
          {tsInstalled === null && (
            <p className="text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              Checking...
            </p>
          )}

          {/* Not installed */}
          {tsInstalled === false && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">Tailscale is not installed. Install it to enable Funnel.</p>
              <div className="flex gap-2">
                <Button onClick={handleInstallTailscale} fullWidth>
                  Install Tailscale
                </Button>
                <Button onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>Cancel</Button>
              </div>
            </div>
          )}

          {/* Installing with progress log */}
          {tsInstalling && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                Installing Tailscale...
              </div>
              {tsInstallLog.length > 0 && (
                <div ref={tsLogRef} className="bg-black/5 dark:bg-white/5 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-text-muted">
                  {tsInstallLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Installed: show Connect button */}
          {tsInstalled === true && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Tailscale installed
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleConnectTailscale()}
                  fullWidth
                >
                  Connect
                </Button>
                <Button onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>Cancel</Button>
              </div>
            </div>
          )}

          {tsStatus && <StatusAlert status={tsStatus} />}
        </div>
      </Modal>

      {/* Disable Tailscale Modal */}
      <Modal
        isOpen={showDisableTsModal}
        title="Disable Tailscale"
        onClose={() => !tsLoading && setShowDisableTsModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">Tailscale Funnel will be stopped. Remote access via Tailscale URL will stop working.</p>
          <div className="flex gap-2">
            <Button onClick={handleDisableTailscale} fullWidth disabled={tsLoading} variant="danger">
              {tsLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button onClick={() => setShowDisableTsModal(false)} variant="ghost" fullWidth disabled={tsLoading}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Headroom Install Guide Modal */}
      <Modal
        isOpen={showHeadroomInstallModal}
        title={headroomRunning ? "Headroom" : "Setup Headroom"}
        onClose={() => setShowHeadroomInstallModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span>Status</span>
            <span className={headroomRunning ? "text-success" : "text-warning"}>
              {headroomStatusLabel}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Proxy URL</p>
            <Input
              value={headroomUrl}
              onChange={(e) => setHeadroomUrl(e.target.value)}
              onBlur={handleHeadroomUrlBlur}
              placeholder="http://localhost:8787"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Use a local proxy for Start/Stop, or an external Docker sidecar like http://headroom:8787.
            </p>
          </div>
          {headroomManaged ? (
            <Button onClick={handleHeadroomStop} variant="ghost" fullWidth disabled={headroomActionLoading}>
              {headroomActionLoading ? "Stopping…" : "Stop Headroom"}
            </Button>
          ) : headroomRunning ? (
            <p className="text-sm text-success">Headroom proxy is reachable. You can enable the token saver.</p>
          ) : headroomCanStart ? (
            <Button onClick={handleHeadroomStart} fullWidth disabled={headroomActionLoading}>
              {headroomActionLoading ? "Starting…" : "Start Headroom"}
            </Button>
          ) : !headroomLocalUrl ? (
            <p className="text-sm text-warning">Start Headroom separately at the configured URL, then recheck.</p>
          ) : !headroomStatus.python ? (
            <p className="text-sm text-warning">Python ≥ 3.10 required for local managed mode. Install Python first, or use an external proxy URL.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Install then click Start:</p>
              <div className="flex items-center gap-2">
                <pre className="flex-1 rounded bg-black/5 dark:bg-white/5 p-2 text-xs font-mono overflow-x-auto">{`pip install "headroom-ai[proxy]"`}</pre>
                <Button size="sm" variant="ghost" onClick={() => copy(`pip install "headroom-ai[proxy]"`)}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
          {headroomActionError && (
            <p className="text-sm text-warning">{headroomActionError}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => refreshHeadroomStatus()} variant="ghost" fullWidth>Recheck</Button>
            <Button onClick={() => setShowHeadroomInstallModal(false)} fullWidth>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}


