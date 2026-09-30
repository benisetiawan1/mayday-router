"use client";

import { useCallback, useEffect, useState } from "react";
import { Toggle } from "@/shared/components";

async function api(url, opts) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export default function ExtendedClient() {
  const [skills, setSkills] = useState([]);
  const [settings, setSettings] = useState({});
  const [hermes, setHermes] = useState({ memory: [], user: [] });
  const [form, setForm] = useState({ id: "", name: "", description: "", prompt: "", routingMode: false, triggers: "", keywords: "", configSchema: "" });
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ skills }, settings] = await Promise.all([api("/api/skills"), api("/api/settings")]);
      setSkills(skills);
      setSettings(settings);
    } catch {}
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap fetch.
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

  const editSkill = (s) => {
    setEditingId(s.id);
    setForm({
      id: s.id,
      name: s.name,
      description: s.description || "",
      prompt: s.prompt_template || "",
      routingMode: !!s.routable,
      triggers: (s.triggers || []).join(", "),
      keywords: (s.keywords || []).join(", "),
      configSchema: Array.isArray(s.config_schema) ? JSON.stringify(s.config_schema) : "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ id: "", name: "", description: "", prompt: "", routingMode: false, triggers: "", keywords: "", configSchema: "" });
  };

  const saveSkill = async () => {
    if (!form.id || !form.name) { setMsg("id dan name wajib"); return; }
    try {
      if (editingId) {
        await api(`/api/skills?id=${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            prompt_template: form.prompt,
            routable: form.routingMode,
            triggers: form.triggers.split(",").map((t) => t.trim()).filter(Boolean),
            keywords: form.keywords.split(",").map((t) => t.trim()).filter(Boolean),
            config_schema: form.configSchema.trim() ? JSON.parse(form.configSchema) : [],
          }),
        });
      } else {
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
            triggers: form.triggers.split(",").map((t) => t.trim()).filter(Boolean),
            keywords: form.keywords.split(",").map((t) => t.trim()).filter(Boolean),
            config_schema: form.configSchema.trim() ? JSON.parse(form.configSchema) : [],
          }),
        });
      }
      setMsg("Skill tersimpan");
      cancelEdit();
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
    <div className="flex w-full flex-col gap-4">
      {msg && <p className="dim text-[12px]">{msg}</p>}

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>01</b> · Router & Dedup</span>
        </div>
        <div className="spec">
          <div className="kv">
            <div className="k">Skill Router (TF-IDF klasifikasi user intent ke skill)</div>
            <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Toggle checked={settings.extendedSkillRouterEnabled} onChange={(v) => patchSetting("extendedSkillRouterEnabled", v)} />
              <span className="dim">manifest-driven</span>
            </div>
          </div>
          <div className="kv">
            <div className="k">Session Skill Dedup (hemat token, inject penuh sekali per sesi)</div>
            <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Toggle checked={settings.extendedSkillDedupEnabled} onChange={(v) => patchSetting("extendedSkillDedupEnabled", v)} />
              <span className="dim">once per session</span>
            </div>
          </div>
          <div className="kv">
            <div className="k">Aktifkan bridge (baca snapshot Mayday, tidak sentuh file Hermes)</div>
            <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Toggle checked={settings.hermesBridgeEnabled} onChange={(v) => patchSetting("hermesBridgeEnabled", v)} />
              <span className="dim">read-only snapshot</span>
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border-subtle)" }}>
          <button type="button" className="btn" onClick={importHermes}>Import dari Hermes (read-only)</button>
        </div>
        {(hermes.memory.length > 0 || hermes.user.length > 0) && (
          <div className="dim text-[12px]" style={{ padding: "0 16px 12px", maxHeight: 180, overflow: "auto" }}>
            {[...hermes.memory, ...hermes.user].map((e, i) => (
              <p key={i} className="truncate">§ {e}</p>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="t"><b>02</b> · Custom Skill Studio (manifest ke disk skills/&lt;id&gt;)</span>
          <div className="acts">
            <button type="button" className="btn primary" onClick={cancelEdit}>+ New skill</button>
          </div>
        </div>

        <div className="frm">
          <span className="fl">id</span>
          <input
            className="inp"
            placeholder="id (a-z, 0-9, -, _)"
            value={form.id}
            disabled={!!editingId}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
          <span className="dim">slug</span>
        </div>
        <div className="frm">
          <span className="fl">name</span>
          <input
            className="inp"
            placeholder="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <span className="dim" />
        </div>
        <div className="frm">
          <span className="fl">description</span>
          <textarea
            className="inp"
            style={{ height: "auto", padding: "8px 10px", lineHeight: 1.5 }}
            rows={2}
            placeholder="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <span className="dim" />
        </div>
        <div className="frm">
          <span className="fl">prompt_template</span>
          <textarea
            className="inp"
            style={{ height: "auto", padding: "8px 10px", lineHeight: 1.5, fontFamily: "var(--font-jetbrains, monospace)" }}
            rows={5}
            placeholder="prompt_template"
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          />
          <span className="dim">markdown</span>
        </div>
        <div className="frm">
          <span className="fl">triggers</span>
          <input
            className="inp"
            placeholder="triggers (pisahkan koma): review, kode, bug"
            value={form.triggers}
            onChange={(e) => setForm({ ...form, triggers: e.target.value })}
          />
          <span className="dim" />
        </div>
        <div className="frm">
          <span className="fl">keywords</span>
          <input
            className="inp"
            placeholder="keywords (pisahkan koma): review, code, security"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          />
          <span className="dim" />
        </div>
        <div className="frm">
          <span className="fl">config_schema</span>
          <textarea
            className="inp"
            style={{ height: "auto", padding: "8px 10px", lineHeight: 1.5, fontFamily: "var(--font-jetbrains, monospace)" }}
            rows={3}
            placeholder='config_schema (JSON): [{"key":"variance","label":"Variance","min":0,"max":1,"default":0.5}]'
            value={form.configSchema}
            onChange={(e) => setForm({ ...form, configSchema: e.target.value })}
          />
          <span className="dim">JSON</span>
        </div>
        <div className="frm">
          <span className="fl">Routable (ikut Skill Router)</span>
          <Toggle checked={form.routingMode} onChange={(v) => setForm({ ...form, routingMode: v })} />
          <span className="dim" />
        </div>

        <div className="frm">
          <span className="fl" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={saveSkill}>
              {editingId ? "Update skill" : "Simpan skill"}
            </button>
            {editingId && (
              <button type="button" className="btn" onClick={cancelEdit}>Batal</button>
            )}
          </div>
          <span className="dim" />
        </div>

        {skills.length > 0 && (
          <div style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
            {skills.map((s) => (
              <div
                key={s.id}
                className="row"
                style={{ gridTemplateColumns: "1fr auto", alignItems: "start", paddingTop: 10, paddingBottom: 10 }}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{s.name} <span className="dim font-normal">({s.id})</span></p>
                  <p className="dim text-[12px] truncate">{s.description}</p>
                  {Array.isArray(s.config_schema) && s.config_schema.map((c) => (
                    <div key={c.key} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="dim text-[11px]" style={{ width: 112, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label || c.key}</span>
                      <input
                        type="range"
                        min={c.min ?? 0}
                        max={c.max ?? 1}
                        step={c.step ?? 0.05}
                        value={settings[`ext_${s.id}_${c.key}`] ?? c.default ?? 0}
                        onChange={(e) => patchSetting(`ext_${s.id}_${c.key}`, Number(e.target.value))}
                        className="flex-1 accent-primary"
                      />
                      <span className="text-[11px] tabular-nums" style={{ width: 32 }}>
                        {settings[`ext_${s.id}_${c.key}`] ?? c.default ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn" onClick={() => deleteSkill(s.id)}>Hapus</button>
                  <button type="button" className="btn" onClick={() => editSkill(s)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}