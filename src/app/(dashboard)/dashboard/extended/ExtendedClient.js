"use client";

import { useCallback, useEffect, useState } from "react";

async function api(url, opts) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

function Section({ title, children }) {
  return (
    <section className="border border-border-subtle bg-surface rounded-[14px] p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
      <span className="text-[13px]">{label}</span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary cursor-pointer"
      />
    </label>
  );
}

export default function ExtendedClient() {
  const [skills, setSkills] = useState([]);
  const [settings, setSettings] = useState({});
  const [hermes, setHermes] = useState({ memory: [], user: [] });
  const [form, setForm] = useState({ id: "", name: "", description: "", prompt: "", routingMode: false });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ skills }, settings] = await Promise.all([api("/api/skills"), api("/api/settings")]);
      setSkills(skills);
      setSettings(settings);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchSetting = useCallback(async (key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
        credentials: "include",
      });
    } catch {}
  }, []);

  const saveSkill = async () => {
    if (!form.id || !form.name) { setMsg("id dan name wajib"); return; }
    try {
      await api("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          description: form.description,
          prompt_template: form.prompt,
          hook: "system-prompt",
          routable: form.routingMode,
        }),
      });
      setMsg("Skill tersimpan");
      setForm({ id: "", name: "", description: "", prompt: "", routingMode: false });
      load();
    } catch (e) { setMsg(e.message); }
  };

  const deleteSkill = async (id) => {
    try {
      await api(`/api/skills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      load();
    } catch (e) { setMsg(e.message); }
  };

  const importHermes = async () => {
    try {
      await api("/api/hermes/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import" }),
      });
      loadHermes();
      setMsg("Import Hermes selesai");
    } catch (e) { setMsg(e.message); }
  };

  const loadHermes = async () => {
    try {
      const [m, u] = await Promise.all([
        api("/api/hermes/memory?target=memory"),
        api("/api/hermes/memory?target=user"),
      ]);
      setHermes({ memory: m.entries, user: u.entries });
    } catch {}
  };

  useEffect(() => { if (settings.hermesBridgeEnabled) loadHermes(); }, [settings.hermesBridgeEnabled]);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">9Router Extended</h1>
        {msg && <p className="text-[12px] text-muted">{msg}</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Router & Dedup">
          <Toggle
            label="Skill Router (TF-IDF klasifikasi user intent ke skill)"
            checked={settings.extendedSkillRouterEnabled}
            onChange={(v) => patchSetting("extendedSkillRouterEnabled", v)}
          />
          <Toggle
            label="Session Skill Dedup (hemat token, inject penuh sekali per sesi)"
            checked={settings.extendedSkillDedupEnabled}
            onChange={(v) => patchSetting("extendedSkillDedupEnabled", v)}
          />
        </Section>

        <Section title="Hermes Memory Bridge (read-only, default OFF)">
          <Toggle
            label="Aktifkan bridge (baca snapshot Mayday, tidak sentuh file Hermes)"
            checked={settings.hermesBridgeEnabled}
            onChange={(v) => patchSetting("hermesBridgeEnabled", v)}
          />
          <button
            type="button"
            onClick={importHermes}
            className="mt-2 px-3 py-1.5 rounded-md bg-primary text-white text-[12px] font-medium hover:bg-primary/90 cursor-pointer"
          >
            Import dari Hermes (read-only)
          </button>
          {(hermes.memory.length > 0 || hermes.user.length > 0) && (
            <div className="mt-3 text-[12px] space-y-1 max-h-48 overflow-auto">
              {[...hermes.memory, ...hermes.user].map((e, i) => (
                <p key={i} className="truncate text-muted">§ {e}</p>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Custom Skill Studio (manifest ke disk skills/<id>)">
        <div className="grid gap-3">
          <input
            className="rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-[13px]"
            placeholder="id (a-z, 0-9, -, _)"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
          <input
            className="rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-[13px]"
            placeholder="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <textarea
            className="rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-[13px]"
            rows={2}
            placeholder="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <textarea
            className="rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-[13px] font-mono"
            rows={5}
            placeholder="prompt_template"
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={form.routingMode}
              onChange={(e) => setForm({ ...form, routingMode: e.target.checked })}
              className="size-4 accent-primary"
            />
            Routable (ikut Skill Router)
          </label>
          <button
            type="button"
            onClick={saveSkill}
            className="px-3 py-1.5 rounded-md bg-primary text-white text-[12px] font-medium hover:bg-primary/90 cursor-pointer w-fit"
          >
            Simpan skill
          </button>
        </div>

        {skills.length > 0 && (
          <ul className="mt-4 divide-y divide-border-subtle">
            {skills.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{s.name} <span className="text-muted font-normal">({s.id})</span></p>
                  <p className="text-[12px] text-muted truncate">{s.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteSkill(s.id)}
                  className="px-2 py-1 rounded-md border border-border-subtle text-[11px] hover:bg-surface-2 cursor-pointer shrink-0"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}