"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, ConfirmModal, Input, Select } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function statusChip(lastStatus) {
  if (lastStatus === "ok") return <Badge variant="success" size="sm">✓ ok</Badge>;
  if (lastStatus === "unauthorized") return <Badge variant="error" size="sm">⚠ 401</Badge>;
  if (lastStatus === "error") return <Badge variant="warning" size="sm">⚠ error</Badge>;
  return <Badge variant="default" size="sm">– never</Badge>;
}

const MODE_OPTIONS = [
  { value: "direct", label: "direct" },
  { value: "backbone", label: "backbone" },
];

const EMPTY_FORM = { name: "", token: "", mode: "direct", countryCodeIn: "" };

export default function WebshareSyncPanel({ onPoolsChanged }) {
  const notify = useNotificationStore();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmState, setConfirmState] = useState(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy-pools/webshare-sync", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setAccounts(data.accounts || []);
    } catch (error) {
      console.log("Error fetching webshare accounts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap fetch.
    fetchAccounts();
  }, [fetchAccounts]);

  const lastSync = useMemo(() => {
    const times = accounts
      .map((a) => a.lastSyncAt)
      .filter(Boolean)
      .map((t) => new Date(t).getTime())
      .filter((n) => Number.isFinite(n));
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }, [accounts]);

  const handleSync = async (accountId) => {
    if (syncing) return;
    setSyncing(true);
    setBusyId(accountId || null);
    try {
      const res = await fetch("/api/proxy-pools/webshare-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountId ? { accountId } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error || "Sync failed");
        return;
      }
      const results = accountId ? [data.result] : (data.results || []);
      const failed = results.filter((r) => r && r.status === "error").length;
      const unauthorized = results.filter((r) => r && r.status === "unauthorized").length;
      await Promise.all([fetchAccounts(), onPoolsChanged?.()]);
      if (unauthorized) notify.warning(`Sync done: ${unauthorized} account(s) unauthorized`);
      else if (failed) notify.warning(`Sync done with ${failed} error(s)`);
      else notify.success(accountId ? "Account synced" : "All accounts synced");
    } catch (error) {
      console.log("Error syncing webshare:", error);
      notify.error("Sync failed");
    } finally {
      setSyncing(false);
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!form.token.trim()) {
      notify.warning("Token is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/proxy-pools/webshare-sync/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          token: form.token.trim(),
          mode: form.mode,
          countryCodeIn: form.countryCodeIn.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm(EMPTY_FORM);
        setShowForm(false);
        await fetchAccounts();
        notify.success("Webshare account added");
      } else {
        notify.error(data.error || "Failed to add account");
      }
    } catch (error) {
      console.log("Error adding webshare account:", error);
      notify.error("Failed to add account");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (account) => {
    const next = account.isActive === false;
    setBusyId(account.id);
    try {
      const res = await fetch("/api/proxy-pools/webshare-sync/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, isActive: next }),
      });
      if (res.ok) {
        await fetchAccounts();
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to update account");
      }
    } catch (error) {
      console.log("Error toggling webshare account:", error);
      notify.error("Failed to update account");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (account) => {
    setConfirmState({
      title: "Delete Webshare Account",
      message: `Delete account "${account.name || account.tokenMasked}" and its synced proxies?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/proxy-pools/webshare-sync/accounts?id=${encodeURIComponent(account.id)}`, { method: "DELETE" });
          if (res.ok) {
            await Promise.all([fetchAccounts(), onPoolsChanged?.()]);
            notify.success("Account deleted");
          } else {
            const data = await res.json();
            notify.error(data.error || "Failed to delete account");
          }
        } catch (error) {
          console.log("Error deleting webshare account:", error);
          notify.error("Failed to delete account");
        }
      },
    });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="t"><b>02</b> · Webshare Sync</span>
        <div className="acts">
          <Button size="sm" variant="secondary" onClick={() => { setForm(EMPTY_FORM); setShowForm((v) => !v); }}>
            {showForm ? "Batal" : "Tambah Akun"}
          </Button>
          <Button size="sm" onClick={() => handleSync(null)} disabled={syncing || loading}>Sync Semua</Button>
        </div>
      </div>

      <div className="grid-6">
        <div className="kv"><div className="k">Accounts</div><div className="v">{accounts.length}</div></div>
        <div className="kv"><div className="k">Last sync</div><div className="v" style={{ fontSize: "11px" }}>{formatDateTime(lastSync)}</div></div>
      </div>

      {showForm && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="My Webshare (optional)" />
            <Input label="API Token" type="password" value={form.token} onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))} placeholder="webshare-token" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select label="Mode" options={MODE_OPTIONS} value={form.mode} onChange={(e) => setForm((p) => ({ ...p, mode: e.target.value }))} />
            <Input label="Country Code (optional)" value={form.countryCodeIn} onChange={(e) => setForm((p) => ({ ...p, countryCodeIn: e.target.value }))} placeholder="US" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button fullWidth onClick={handleCreate} disabled={!form.token.trim() || saving}>{saving ? "Saving..." : "Save Account"}</Button>
            <Button fullWidth variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="empty">
          <div className="big">No Webshare accounts yet</div>
          <div className="sub">Add a Webshare account to sync its proxies into the pool automatically.</div>
        </div>
      ) : (
        <div>
          {accounts.map((account) => (
            <div key={account.id} className="row" style={{ gridTemplateColumns: "1fr auto", alignItems: "start", paddingTop: 10, paddingBottom: 10 }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="cr-name truncate">{account.name || "Webshare"}</span>
                  {statusChip(account.lastStatus)}
                  {account.isActive === false && <Badge variant="default" size="sm">disabled</Badge>}
                  <Badge variant="default" size="sm">{account.mode}</Badge>
                </div>
                <p className="sid truncate">Token: {account.tokenMasked}</p>
                <p className="sid">
                  {account.lastCount ?? 0} proxies · Last sync: {formatDateTime(account.lastSyncAt)}
                  {account.lastError ? ` · ${account.lastError}` : ""}
                </p>
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button size="sm" variant="secondary" onClick={() => handleSync(account.id)} disabled={syncing || busyId === account.id}>
                  Sync
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleToggle(account)} disabled={busyId === account.id}>
                  {account.isActive === false ? "Aktifkan" : "Nonaktifkan"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(account)} disabled={busyId === account.id}>
                  Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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